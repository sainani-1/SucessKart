import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AnswerEntry {
  question_id: number;
  answer: string | null;
}

interface CodingResult {
  question_id: number;
  passed: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing required Supabase environment variables.", {
        status: 500,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Missing Authorization bearer token.", {
        status: 401,
        headers: corsHeaders,
      });
    }
    const callerJwt = authHeader.replace("Bearer ", "").trim();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is authenticated
    const { data: callerData, error: callerError } = await adminClient.auth.getUser(callerJwt);
    if (callerError || !callerData?.user?.id) {
      return new Response("Invalid session token.", { status: 401, headers: corsHeaders });
    }
    const userId = callerData.user.id;

    const body = await req.json();
    const examId = Number(body.exam_id);
    const answers: AnswerEntry[] = body.answers || [];
    const codingResults: CodingResult[] = body.coding_results || [];
    const startedAt = body.started_at ? String(body.started_at) : null;

    if (!examId) {
      return new Response("exam_id is required.", { status: 400, headers: corsHeaders });
    }

    // Fetch exam metadata (try exams table first, then courses)
    let durationMinutes = 60;
    let passPercent = 40;
    let generateCertificate = false;
    let courseId: number | null = null;

    const { data: examRow } = await adminClient
      .from("exams")
      .select("id, duration_minutes, pass_percent, generate_certificate, course_id")
      .eq("id", examId)
      .maybeSingle();

    if (examRow) {
      durationMinutes = examRow.duration_minutes ?? 60;
      passPercent = examRow.pass_percent ?? 40;
      generateCertificate = examRow.generate_certificate ?? false;
      courseId = examRow.course_id;
    } else {
      // Fallback: treat examId as course_id
      const { data: courseRow } = await adminClient
        .from("courses")
        .select("id, duration_minutes, pass_percent, generate_certificate, title")
        .eq("id", examId)
        .maybeSingle();

      if (courseRow) {
        durationMinutes = courseRow.duration_minutes ?? 60;
        passPercent = courseRow.pass_percent ?? 40;
        generateCertificate = courseRow.generate_certificate ?? false;
        courseId = courseRow.id;
      } else {
        return new Response("Exam or course not found.", { status: 404, headers: corsHeaders });
      }
    }

    // Time validation
    if (startedAt) {
      const startedMs = new Date(startedAt).getTime();
      if (isNaN(startedMs)) {
        return new Response("Invalid started_at timestamp.", { status: 400, headers: corsHeaders });
      }
      const deadlineMs = startedMs + Math.max(1, durationMinutes) * 60 * 1000;
      if (Date.now() > deadlineMs + 120000) {
        // 2-minute grace period for submission delay
        return new Response(JSON.stringify({
          success: false,
          error: "time_expired",
          message: "Exam time has expired. Submission rejected.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fetch questions with correct answers (server-side only)
    const { data: questions, error: questionsError } = await adminClient
      .from("exam_questions")
      .select("id, correct_index, question_type, options")
      .eq("exam_id", examId)
      .order("order_index", { ascending: true });

    if (questionsError) {
      return new Response(questionsError.message || "Failed to fetch questions.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Grade MCQ answers server-side
    let correctCount = 0;
    let totalCount = 0;

    for (const q of questions) {
      if (q.question_type === "coding") {
        // Coding results come from Judge0 (external API), trust the result
        totalCount += 1;
        const codingResult = codingResults.find((cr) => cr.question_id === q.id);
        if (codingResult?.passed) {
          correctCount += 1;
        }
        continue;
      }

      // MCQ grading
      const options = q.options as string[] | null;
      if (!options?.length || q.correct_index == null || q.correct_index < 0) continue;

      totalCount += 1;
      const answerEntry = answers.find((a) => a.question_id === q.id);
      const correctAnswer = options[q.correct_index];
      if (answerEntry && correctAnswer != null && answerEntry.answer === correctAnswer) {
        correctCount += 1;
      }
    }

    const percentage = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
    const passed = totalCount === 0 ? true : percentage >= passPercent;

    // Check existing submissions
    const { data: existingSubs } = await adminClient
      .from("exam_submissions")
      .select("id, passed, attempt_number")
      .eq("user_id", userId)
      .eq("exam_id", examId)
      .order("attempt_number", { ascending: false })
      .limit(1);

    const lastAttempt = existingSubs?.[0];

    // Prevent overwriting a passed submission
    if (lastAttempt?.passed) {
      return new Response(JSON.stringify({
        success: false,
        error: "already_passed",
        message: "You have already passed this exam.",
        existing_submission_id: lastAttempt.id,
        passed: true,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const attemptNumber = (lastAttempt?.attempt_number ?? 0) + 1;

    // Prevent excessive retries (max 10 attempts)
    if (attemptNumber > 10) {
      return new Response(JSON.stringify({
        success: false,
        error: "max_attempts",
        message: "Maximum number of attempts (10) reached.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Calculate next_attempt_allowed_at
    // Default lock: 60 days for non-teacher exams
    const nextAttemptAllowedAt = passed
      ? null
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

    // Insert submission (no upsert — each attempt is a new row)
    const { data: submission, error: insertError } = await adminClient
      .from("exam_submissions")
      .insert({
        user_id: userId,
        exam_id: examId,
        score_percent: percentage,
        passed,
        attempt_number: attemptNumber,
        started_at: startedAt,
        submitted_at: new Date().toISOString(),
        next_attempt_allowed_at: nextAttemptAllowedAt,
      })
      .select("id")
      .single();

    if (insertError) {
      return new Response(insertError.message || "Failed to save submission.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Generate certificate if passed
    if (passed && generateCertificate && courseId) {
      await adminClient.from("certificates").insert({
        user_id: userId,
        course_id: courseId,
        exam_submission_id: submission.id,
        issued_at: new Date().toISOString(),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      success: true,
      submission_id: String(submission.id),
      attempt_number: attemptNumber,
      correct: correctCount,
      total: totalCount,
      score_percent: percentage,
      passed,
      next_attempt_allowed_at: nextAttemptAllowedAt,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
