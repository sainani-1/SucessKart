import React, { useEffect, useState } from 'react';
import { CheckCircle2, Hash, MessageSquare, Send, ThumbsUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { trackLearningActivity } from '../utils/learningActivity';
import { buildPlanCheckoutPath } from '../utils/planCheckout';

function parseTags(input) {
  return [...new Set(
    String(input || '')
      .split(/[,\s]+/)
      .map((token) => token.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)
  )].slice(0, 5);
}

const DiscussionForum = () => {
  const { profile, isPremiumPlus } = useAuth();
  const [posts, setPosts] = useState([]);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [votes, setVotes] = useState({ posts: new Set(), answers: new Set() });
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [postDraft, setPostDraft] = useState({ title: '', body: '', tags: '#python #java' });
  const [answerDraft, setAnswerDraft] = useState('');
  const [search, setSearch] = useState('');
  const premiumPlusAccess = isPremiumPlus(profile);

  const loadVotes = async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from('discussion_votes').select('post_id, answer_id').eq('user_id', profile.id);
    setVotes({
      posts: new Set((data || []).map((item) => item.post_id).filter(Boolean)),
      answers: new Set((data || []).map((item) => item.answer_id).filter(Boolean)),
    });
  };

  const loadPosts = async () => {
    const { data } = await supabase
      .from('discussion_posts')
      .select('id, user_id, title, body, tags, upvotes_count, answers_count, best_answer_id, last_activity_at, created_at, author:profiles(full_name, avatar_url, role)')
      .order('last_activity_at', { ascending: false });
    const nextPosts = data || [];
    setPosts(nextPosts);
    if (!selectedPostId && nextPosts[0]?.id) {
      setSelectedPostId(nextPosts[0].id);
    }
    if (selectedPostId && !nextPosts.find((item) => item.id === selectedPostId)) {
      setSelectedPostId(nextPosts[0]?.id || null);
    }
  };

  const loadAnswers = async (postId) => {
    if (!postId) {
      setAnswers([]);
      return;
    }
    const { data } = await supabase
      .from('discussion_answers')
      .select('id, post_id, user_id, body, is_best_answer, upvotes_count, created_at, author:profiles(full_name, avatar_url, role)')
      .eq('post_id', postId)
      .order('is_best_answer', { ascending: false })
      .order('upvotes_count', { ascending: false })
      .order('created_at', { ascending: true });
    setAnswers(data || []);
  };

  useEffect(() => {
    if (!profile?.id) return;
    setLoading(true);
    Promise.all([loadPosts(), loadVotes()]).finally(() => setLoading(false));
  }, [profile?.id]);

  useEffect(() => {
    loadAnswers(selectedPostId);
  }, [selectedPostId]);

  useEffect(() => {
    if (!profile?.id) return undefined;

    const channel = supabase
      .channel(`discussion-forum-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_posts' }, () => loadPosts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_answers' }, () => loadAnswers(selectedPostId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_votes' }, () => {
        loadPosts();
        loadAnswers(selectedPostId);
        loadVotes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, selectedPostId]);

  if (profile?.role === 'student' && !premiumPlusAccess) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-indigo-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <MessageSquare size={24} />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Premium Plus Required</h1>
        <p className="mt-3 text-sm text-slate-600">
          Discussion Forum is available only in Premium Plus.
        </p>
        <a
          href={buildPlanCheckoutPath('premium_plus')}
          className="mt-5 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Buy Premium Plus
        </a>
      </div>
    );
  }

  const selectedPost = posts.find((item) => item.id === selectedPostId) || null;
  const visiblePosts = posts.filter((post) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      post.title.toLowerCase().includes(q) ||
      post.body.toLowerCase().includes(q) ||
      (post.tags || []).some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const submitPost = async () => {
    if (!profile?.id || !postDraft.title.trim() || !postDraft.body.trim()) return;
    setPosting(true);
    try {
      const tags = parseTags(postDraft.tags);
      await supabase.from('discussion_posts').insert({
        user_id: profile.id,
        title: postDraft.title.trim(),
        body: postDraft.body.trim(),
        tags,
      });
      await trackLearningActivity({
        userId: profile.id,
        eventType: 'discussion_post_created',
        pointsAwarded: 25,
        durationMinutes: 10,
        metadata: { tags },
      });
      setPostDraft({ title: '', body: '', tags: '' });
      loadPosts();
    } finally {
      setPosting(false);
    }
  };

  const submitAnswer = async () => {
    if (!profile?.id || !selectedPostId || !answerDraft.trim()) return;
    setAnswering(true);
    try {
      await supabase.from('discussion_answers').insert({
        post_id: selectedPostId,
        user_id: profile.id,
        body: answerDraft.trim(),
      });
      await trackLearningActivity({
        userId: profile.id,
        eventType: 'discussion_answer_created',
        pointsAwarded: 30,
        durationMinutes: 10,
        metadata: { postId: selectedPostId },
      });
      setAnswerDraft('');
      loadAnswers(selectedPostId);
      loadPosts();
    } finally {
      setAnswering(false);
    }
  };

  const toggleVote = async ({ postId = null, answerId = null }) => {
    if (!profile?.id) return;
    const hasVote = postId ? votes.posts.has(postId) : votes.answers.has(answerId);

    if (hasVote) {
      let query = supabase.from('discussion_votes').delete().eq('user_id', profile.id);
      query = postId ? query.eq('post_id', postId) : query.eq('answer_id', answerId);
      await query;
    } else {
      await supabase.from('discussion_votes').insert({
        user_id: profile.id,
        post_id: postId,
        answer_id: answerId,
      });
      await trackLearningActivity({
        userId: profile.id,
        eventType: 'discussion_upvote',
        pointsAwarded: 5,
        metadata: { postId, answerId },
      });
    }

    loadVotes();
    loadPosts();
    loadAnswers(selectedPostId);
  };

  const markBestAnswer = async (answerId) => {
    if (!selectedPost || !profile?.id) return;
    const canMark =
      selectedPost.user_id === profile.id ||
      profile.role === 'teacher' ||
      profile.role === 'admin';
    if (!canMark) return;

    await supabase
      .from('discussion_posts')
      .update({ best_answer_id: selectedPost.best_answer_id === answerId ? null : answerId })
      .eq('id', selectedPost.id);

    loadPosts();
    loadAnswers(selectedPost.id);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-sky-950 via-slate-950 to-indigo-950 p-8 text-white shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Real-Time Doubt Discussion Forum</p>
        <h1 className="mt-3 text-3xl font-bold">Ask like Stack Overflow. Learn like a cohort.</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          Post doubts, tag languages, upvote useful replies, and mark the best answer so the next student finds it faster.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.55fr]">
        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">Ask a doubt</p>
            <input
              value={postDraft.title}
              onChange={(event) => setPostDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Why is my recursion stopping early?"
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <textarea
              value={postDraft.body}
              onChange={(event) => setPostDraft((current) => ({ ...current, body: event.target.value }))}
              rows={5}
              placeholder="Describe what you tried, what you expected, and what happened."
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <input
              value={postDraft.tags}
              onChange={(event) => setPostDraft((current) => ({ ...current, tags: event.target.value }))}
              placeholder="#java #python #arrays"
              className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={submitPost}
              disabled={posting}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={16} />
              {posting ? 'Posting...' : 'Post doubt'}
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">Questions feed</p>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search tags or title"
                className="w-44 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="mt-4 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-500">Loading forum...</p>
              ) : visiblePosts.length === 0 ? (
                <p className="text-sm text-slate-500">No questions match your search yet.</p>
              ) : (
                visiblePosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setSelectedPostId(post.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedPostId === post.id
                        ? 'border-sky-300 bg-sky-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-semibold text-slate-900">{post.title}</h2>
                        <p className="mt-2 text-sm text-slate-500">{post.body}</p>
                      </div>
                      {post.best_answer_id ? <CheckCircle2 size={18} className="shrink-0 text-emerald-600" /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(post.tags || []).map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                      <span>{post.author?.full_name || 'Student'}</span>
                      <span>{post.upvotes_count} upvotes</span>
                      <span>{post.answers_count} answers</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {!selectedPost ? (
            <div className="flex min-h-[420px] items-center justify-center text-center">
              <div>
                <MessageSquare size={42} className="mx-auto text-slate-300" />
                <p className="mt-3 text-lg font-semibold text-slate-900">Select a question</p>
                <p className="mt-2 text-sm text-slate-500">Open a thread to read replies and contribute.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{selectedPost.title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{selectedPost.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleVote({ postId: selectedPost.id })}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                      votes.posts.has(selectedPost.id)
                        ? 'bg-sky-600 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <ThumbsUp size={16} />
                    {selectedPost.upvotes_count}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(selectedPost.tags || []).map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                      <Hash size={12} />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-slate-900">Answers</h3>
                  <span className="text-sm text-slate-500">{answers.length} replies</span>
                </div>
                <div className="mt-4 space-y-4">
                  {answers.length === 0 ? (
                    <p className="text-sm text-slate-500">No answers yet. Be the first to help.</p>
                  ) : (
                    answers.map((answer) => (
                      <div key={answer.id} className={`rounded-2xl border p-4 ${answer.is_best_answer ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">{answer.author?.full_name || 'Learner'}</p>
                              {answer.is_best_answer ? (
                                <span className="rounded-full bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">Best answer</span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{answer.body}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleVote({ answerId: answer.id })}
                            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
                              votes.answers.has(answer.id)
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <ThumbsUp size={15} />
                            {answer.upvotes_count}
                          </button>
                        </div>
                        {(selectedPost.user_id === profile?.id || profile?.role === 'teacher' || profile?.role === 'admin') ? (
                          <button
                            type="button"
                            onClick={() => markBestAnswer(answer.id)}
                            className="mt-3 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            {selectedPost.best_answer_id === answer.id ? 'Remove best answer' : 'Mark as best answer'}
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Write an answer</p>
                <textarea
                  value={answerDraft}
                  onChange={(event) => setAnswerDraft(event.target.value)}
                  rows={5}
                  placeholder="Explain the fix, include code snippets or reasoning, and help the next student too."
                  className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  type="button"
                  onClick={submitAnswer}
                  disabled={answering}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Send size={16} />
                  {answering ? 'Submitting...' : 'Submit answer'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default DiscussionForum;
