import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Send, Bot, User, Crown, Lock, BookOpen, Lightbulb, ArrowRight, Brain } from 'lucide-react';
import { supabase } from '../supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import { generateAssistantReply } from '../utils/aiAssistant';
import { logError } from '../utils/errorLogger';

const AILearningPath = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [showCourseSelector, setShowCourseSelector] = useState(true);
  const messagesEndRef = useRef(null);

  const isPremium = profile?.premium_until && new Date(profile.premium_until) > new Date();

  useEffect(() => {
    if (profile?.role !== 'student') {
      navigate('/app');
    }
  }, [profile, navigate]);

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadCourses = async () => {
    try {
      setLoadingCourses(true);
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, category, description')
        .eq('is_active', true)
        .order('title', { ascending: true });

      if (error) throw error;
      setCourses(data || []);
    } catch (err) {
      logError({ message: 'Error loading courses:', source: 'AILearningPath', details: err });
    } finally {
      setLoadingCourses(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const selectCourse = (course) => {
    setSelectedCourse(course);
    setShowCourseSelector(false);
    setMessages([
      {
        role: 'assistant',
        content: `📚 **${course.title}** Learning Path\n\nHello! I'm your AI Learning Assistant for **${course.title}**. I can:\n\n✅ Answer questions about any topic in this course\n✅ Explain complex concepts in simple terms\n✅ Provide real-world examples and applications\n✅ Suggest learning strategies and tips\n✅ Help you prepare for exams\n✅ Create personalized learning paths based on your questions\n\n🎯 What would you like to learn about **${course.title}**?`,
        timestamp: new Date(),
        courseId: course.id,
        courseName: course.title
      }
    ]);
  };

  const generateAIResponse = (userMessage, courseTitle) => {
    const msg = userMessage.toLowerCase();
    
    // Question detection and response generation
    if (msg.includes('what') || msg.includes('how') || msg.includes('why') || msg.includes('explain') || msg.includes('define')) {
      
      // Math/Science concepts
      if (msg.includes('formula') || msg.includes('equation') || msg.includes('calculation')) {
        return `📐 **Formula & Calculation Guide**\n\nFor **${courseTitle}**, here are key concepts:\n\n**Key Points:**\n- Break down complex formulas step-by-step\n- Understand the underlying principles first\n- Practice with multiple examples\n- Identify patterns in similar problems\n\n**Learning Strategy:**\n1️⃣ Learn the concept\n2️⃣ Understand the formula derivation\n3️⃣ Practice with basic examples\n4️⃣ Solve advanced problems\n5️⃣ Apply to real-world scenarios\n\n**Tips for Success:**\n- Create formula flashcards\n- Work through practice problems daily\n- Connect concepts to real-life applications\n- Form study groups for peer learning\n\nWould you like me to explain a specific formula from **${courseTitle}**?`;
      }

      // Conceptual understanding
      if (msg.includes('concept') || msg.includes('principle') || msg.includes('theory')) {
        return `💡 **Conceptual Understanding Framework**\n\nFor **${courseTitle}**, here's how to master concepts:\n\n**The Learning Pyramid (Retention Rates):**\n- 📖 Reading: 10% retention\n- 🎥 Videos: 20% retention\n- 👂 Listening: 30% retention\n- 👀 Seeing demonstrations: 50% retention\n- 💬 Discussion: 70% retention\n- 🧠 Teaching others: 90% retention\n\n**Your Personalized Path:**\n1. **Foundation:** Learn basic definitions and core principles\n2. **Connection:** Link to previous knowledge\n3. **Application:** Solve practice problems\n4. **Mastery:** Teach the concept to someone else\n\n**Deep Learning Questions to Ask:**\n- Why does this concept work?\n- How does it connect to other topics?\n- What real-world problems does it solve?\n- What are exceptions or special cases?\n\nWhat specific concept from **${courseTitle}** would you like to explore?`;
      }

      // Topic-specific help
      if (msg.includes('topic') || msg.includes('chapter') || msg.includes('lesson')) {
        return `📖 **Topic Mastery Approach**\n\nFor topics in **${courseTitle}**, follow this proven method:\n\n**Phase 1: Introduction (15-20 min)**\n- Read the overview\n- Watch introductory videos\n- Understand key vocabulary\n- Identify main learning objectives\n\n**Phase 2: Deep Dive (30-40 min)**\n- Study detailed explanations\n- Take notes (handwritten for better retention)\n- Draw diagrams or mind maps\n- Understand examples thoroughly\n\n**Phase 3: Practice (40-60 min)**\n- Solve practice problems\n- Test yourself frequently\n- Identify weak areas\n- Review difficult concepts\n\n**Phase 4: Review (10-15 min)**\n- Summarize key points\n- Create quick reference guides\n- Explain to someone else\n- Plan next learning session\n\n**Best Resources:**\n- Course materials and textbooks\n- Online video lectures\n- Practice problem sets\n- Study groups and forums\n\nWhich topic from **${courseTitle}** interests you?`;
      }

      // Study tips and techniques
      if (msg.includes('study') || msg.includes('learn') || msg.includes('prepare') || msg.includes('exam')) {
        return `🎯 **Personalized Study & Exam Preparation Plan**\n\nFor mastering **${courseTitle}**:\n\n**Study Techniques (Choose Your Style):**\n\n📚 **Visual Learners:**\n- Create mind maps and diagrams\n- Use color-coded notes\n- Watch concept videos\n- Create infographics\n\n👂 **Auditory Learners:**\n- Record your notes as voice memos\n- Join study group discussions\n- Participate in Q&A sessions\n- Listen to concept podcasts\n\n✍️ **Kinesthetic Learners:**\n- Hands-on experiments/labs\n- Build projects and models\n- Solve practice problems repeatedly\n- Teach concepts to others\n\n**Exam Preparation (8-Week Plan):**\n\n**Week 1-2:** Review all topics, identify weak areas\n**Week 3-4:** Solve practice exams, analyze mistakes\n**Week 5-6:** Focus on difficult topics, re-solve past exams\n**Week 7:** Mock tests and speed practice\n**Week 8:** Final review and confidence building\n\n**Week Before Exam:**\n- ✅ Light revision only\n- ✅ Get adequate sleep\n- ✅ Maintain health and fitness\n- ✅ Organize study materials\n- ✅ Plan exam day logistics\n\n**During Exam:**\n- Read questions carefully (2 min)\n- Answer easy questions first (70% of time)\n- Review answers (10% of time)\n- Stay calm and focused\n\nTell me which topics in **${courseTitle}** are challenging for you?`;
      }

      // Real-world applications
      if (msg.includes('example') || msg.includes('application') || msg.includes('real') || msg.includes('practical')) {
        return `🌍 **Real-World Applications & Career Connection**\n\n**${courseTitle}** has exciting real-world applications:\n\n**Industry Applications:**\n- Understand how concepts are used in actual jobs\n- Connect learning to career opportunities\n- Build relevant skills for the job market\n- Create impressive portfolio projects\n\n**Practical Learning Approach:**\n1. **Case Studies:** Analyze real business problems\n2. **Projects:** Build something using course concepts\n3. **Internships:** Gain hands-on experience\n4. **Competitions:** Apply knowledge to challenges\n5. **Mentorship:** Learn from industry experts\n\n**Career Paths for **${courseTitle}** Experts:**\n- High-growth technology fields\n- Competitive salaries and benefits\n- Remote work opportunities\n- Consulting and leadership roles\n- Entrepreneurship potential\n\n**How to Build Experience:**\n- Create 2-3 impressive projects\n- Contribute to open-source (if applicable)\n- Document your learning journey\n- Network with professionals\n- Build a portfolio website\n\n**Next Steps:**\n1. Learn the core concepts\n2. Practice with real-world data\n3. Build a portfolio project\n4. Showcase on LinkedIn\n5. Apply for internships/jobs\n\nWould you like project ideas based on **${courseTitle}**?`;
      }

      // Common misconceptions
      if (msg.includes('mistake') || msg.includes('wrong') || msg.includes('confusion') || msg.includes('common')) {
        return `⚠️ **Common Misconceptions & How to Avoid Them**\n\nIn **${courseTitle}**, students often struggle with:\n\n**Mistake #1: Memorization Over Understanding**\n- ❌ Wrong: Memorize formulas without understanding\n- ✅ Right: Understand why formulas work, then memorize\n- 💡 Fix: Ask \"why\" questions for every concept\n\n**Mistake #2: Skipping Basics**\n- ❌ Wrong: Jump to complex topics immediately\n- ✅ Right: Build strong foundation first\n- 💡 Fix: Review fundamentals regularly\n\n**Mistake #3: Not Doing Enough Practice**\n- ❌ Wrong: Study theory without problem-solving\n- ✅ Right: 70% practice, 30% theory\n- 💡 Fix: Solve at least 50+ diverse problems\n\n**Mistake #4: Passive Learning**\n- ❌ Wrong: Just read notes and watch videos\n- ✅ Right: Active learning through teaching others\n- 💡 Fix: Teach concepts to a study partner\n\n**Mistake #5: Ignoring Weak Areas**\n- ❌ Wrong: Skip topics that are hard\n- ✅ Right: Spend extra time on difficult topics\n- 💡 Fix: Create a \"mastery checklist\"\n\n**Mistake #6: Poor Time Management**\n- ❌ Wrong: Last-minute cramming\n- ✅ Right: Consistent daily learning (1-2 hours)\n- 💡 Fix: Use spaced repetition technique\n\n**Success Checklist:**\n- [ ] Understand before memorizing\n- [ ] Practice problems daily\n- [ ] Review mistakes thoroughly\n- [ ] Connect concepts together\n- [ ] Explain to others regularly\n- [ ] Track progress with tests\n\nWhich misconception has affected your learning?`;
      }
    }

    // Resource recommendations
    if (msg.includes('resource') || msg.includes('book') || msg.includes('video') || msg.includes('reference')) {
      return `📚 **Learning Resources for **${courseTitle}****\n\n**Types of Resources You Should Use:**\n\n**Textbooks & Books:**\n- Standard textbooks for comprehensive coverage\n- Reference books for advanced topics\n- Practice problem books\n\n**Online Platforms:**\n- Video lectures for visual learning\n- Interactive simulations\n- Coding platforms (if applicable)\n- Quiz and test banks\n\n**Note-Taking Strategies:**\n- Use Cornell method (3 sections per page)\n- Create concept maps\n- Maintain a formula reference sheet\n- Keep a mistake log\n\n**Study Materials:**\n- Flashcards for definitions\n- Mind maps for connections\n- Summary sheets (one page per topic)\n- Practice exam papers\n\n**Time Allocation:**\n- 30% Reading/Videos\n- 50% Practice Problems\n- 20% Review/Revision\n\n**Organization System:**\n- Folder for each topic\n- Labeled by difficulty level\n- Weekly progress tracking\n- Revision schedule\n\nLet me know what type of resource would help you most for **${courseTitle}**!`;
    }

    // Progress tracking
    if (msg.includes('progress') || msg.includes('track') || msg.includes('improve') || msg.includes('better')) {
      return `📊 **Progress Tracking & Continuous Improvement**\n\n**For **${courseTitle}**, measure your growth:\n\n**Metrics to Track:**\n📈 Quiz/Test scores (target: 80%+)\n⏱️ Time to solve problems (measure improvement)\n🎯 Topics mastered (checklist)\n📝 Practice problems completed\n💯 Accuracy percentage\n\n**Weekly Progress Review:**\n\n**Monday:** Assess week ahead, set 3-5 learning goals\n**Mid-week:** Check progress, adjust if needed\n**Friday:** Evaluate what you learned, celebrate wins\n**Sunday:** Plan next week, identify weak areas\n\n**Improvement Strategies:**\n\n**If Quiz Scores Are Low:**\n1. Review weak topics (30 min daily)\n2. Solve more practice problems\n3. Join study group sessions\n4. Ask for tutoring help\n5. Retry quiz after 3 days\n\n**If Learning Is Slow:**\n1. Change study method (try visual learning)\n2. Increase practice frequency\n3. Find a study partner\n4. Break topics into smaller chunks\n5. Use more varied resources\n\n**Performance Milestones:**\n- 📍 Quiz 1: 70%+ (Understanding basics)\n- 📍 Quiz 2: 75%+ (Applying concepts)\n- 📍 Quiz 3: 80%+ (Connecting topics)\n- 📍 Final: 85%+ (Mastery level)\n\n**Create Your Progress Dashboard:**\n- Topics completed: ______ / ______\n- Current score: ______%\n- Target score: 85%\n- Days until exam: ______\n- Daily study hours: 2-3 hours\n\nWhat area of **${courseTitle}** would you like to improve most?`;
    }

    // Help and support
    if (msg.includes('help') || msg.includes('stuck') || msg.includes('confused') || msg.includes('lost')) {
      return `🆘 **Getting Help & Overcoming Obstacles**\n\n**You're Not Alone! Here's How to Get Unstuck:**\n\n**Step 1: Identify the Problem**\n- Is it a concept you don't understand?\n- Is it difficulty solving problems?\n- Is it time management?\n- Is it exam anxiety?\n- Is it motivation?\n\n**Step 2: Find Help (Choose Your Style)**\n\n💬 **Ask Your Questions:**\n- Ask on course forums\n- Post in study group chats\n- Consult textbook Q&A sections\n- Message your teacher\n\n📖 **Review Resources:**\n- Rewatch concept videos\n- Read alternative explanations\n- Search for simpler tutorials\n- Find similar solved problems\n\n👥 **Group Learning:**\n- Join study groups for **${courseTitle}**\n- Discuss difficult topics\n- Explain concepts to each other\n- Solve problems together\n\n🎓 **Professional Help:**\n- Get tutoring for difficult areas\n- Attend teacher office hours\n- Join extra learning sessions\n- Work with mentors\n\n**Step 3: Practice & Build Confidence**\n- Solve easier problems first\n- Build momentum gradually\n- Celebrate small wins\n- Track improvement\n\n**Step 4: Prevent Future Struggles**\n- Review regularly (not just before exams)\n- Ask questions immediately\n- Don't skip difficult topics\n- Maintain consistent study habits\n\n**Emergency Help Resources:**\n- 📞 Contact your instructor\n- 💬 Course teaching assistants\n- 👨‍🎓 Senior student mentors\n- 📱 Study group members\n\n**Remember:** Every expert was once a beginner. Struggling is part of learning!\n\nWhat specifically are you struggling with in **${courseTitle}**?`;
    }

    // Default helpful response
    return `🎓 **Your AI Learning Assistant for **${courseTitle}****\n\n**I can help you with:**\n\n📐 **Explain Concepts** - Ask about any topic, formula, or principle\n✏️ **Practice Problems** - Get help with problem-solving strategies\n📚 **Study Tips** - Personalized study techniques for your learning style\n💡 **Real-World Applications** - Understand why this matters in real life\n⚠️ **Common Mistakes** - Avoid pitfalls other students encounter\n📊 **Progress Tracking** - Monitor your improvement and stay motivated\n🎯 **Exam Prep** - Strategic preparation for success\n🆘 **When You're Stuck** - Get unstuck with clear guidance\n\n**How to Ask Questions:**\n- \"Explain [concept] for me\"\n- \"How do I solve [problem type]?\"\n- \"What are the best study tips for this course?\"\n- \"How is this used in real life?\"\n- \"I'm confused about [topic], help!\"\n- \"How do I prepare for the exam?\"\n\n**Pro Tips for Maximum Learning:**\n✅ Ask specific questions\n✅ Take notes while learning\n✅ Practice solving problems\n✅ Review frequently\n✅ Ask follow-up questions\n✅ Connect concepts together\n\n**What would you like to learn about **${courseTitle}** today?**`;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading || !selectedCourse || !isPremium) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
      courseId: selectedCourse.id,
      courseName: selectedCourse.title
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const assistantText =
        (await generateAssistantReply({
          systemInstruction: `
You are a subject learning assistant inside an edtech platform.
The current subject is "${selectedCourse.title}".
Help the student understand concepts, study plans, exam preparation, examples, practice direction, and learning strategies for this subject.
Keep responses clear, accurate, and student-friendly.
Do not mention the underlying AI provider, model, or vendor.
Prefer short sections or bullet points when useful.
`,
          history: messages,
          message: input,
        })) || generateAIResponse(input, selectedCourse.title);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: assistantText,
        timestamp: new Date(),
        courseId: selectedCourse.id,
        courseName: selectedCourse.title
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: generateAIResponse(input, selectedCourse.title),
        timestamp: new Date(),
        courseId: selectedCourse.id,
        courseName: selectedCourse.title
      }]);
    } finally {
      setLoading(false);
    }
  };

  const changeCourse = () => {
    setShowCourseSelector(true);
    setSelectedCourse(null);
    setMessages([]);
  };

  if (!isPremium) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-2xl mx-auto mt-20">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center border-2 border-blue-200">
            <Crown className="mx-auto mb-4 text-yellow-500" size={48} />
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Premium Feature</h1>
            <p className="text-gray-600 mb-6">
              AI-Powered Personalized Learning Path is exclusively available to premium members.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 font-medium mb-3">✨ Premium Benefits Include:</p>
              <ul className="text-sm text-blue-700 space-y-2">
                <li>✅ AI Learning Path for all subjects</li>
                <li>✅ Personalized learning recommendations</li>
                <li>✅ Advanced exam preparation</li>
                <li>✅ 24/7 AI tutoring support</li>
                <li>✅ Progress tracking and analytics</li>
              </ul>
            </div>
            <button
              onClick={() => navigate('/app/payment')}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:shadow-lg transition-all"
            >
              Upgrade to Premium Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadingCourses) {
    return <LoadingSpinner message="Loading available subjects..." />;
  }

  if (showCourseSelector || !selectedCourse) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              <Brain className="text-blue-600" size={40} />
              AI-Powered Learning Path
            </h1>
            <p className="text-gray-600">Select a subject to start personalized learning with AI assistance</p>
          </div>

          {courses.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <BookOpen className="mx-auto mb-4 text-gray-400" size={48} />
              <p className="text-gray-500 mb-4">No courses available yet</p>
              <button
                onClick={() => navigate('/app/courses')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                Explore Courses
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map(course => (
                <div
                  key={course.id}
                  onClick={() => selectCourse(course)}
                  className="bg-white rounded-xl shadow-md hover:shadow-xl p-6 cursor-pointer transform hover:scale-105 transition-all border-2 border-transparent hover:border-blue-400"
                >
                  <div className="flex items-start justify-between mb-3">
                    <BookOpen className="text-blue-600" size={32} />
                    <ArrowRight className="text-gray-400" size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{course.title}</h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{course.description || 'Learn with personalized AI assistance'}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded-full">{course.category}</span>
                    <span className="text-xs text-gray-500">AI Tutoring</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col p-4">
      <div className="max-w-4xl mx-auto w-full flex flex-col h-screen">
        {/* Header */}
        <div className="bg-white rounded-t-2xl shadow-lg p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Brain className="text-blue-600" size={32} />
              <div>
                <h1 className="text-xl font-bold text-gray-900">{selectedCourse.title}</h1>
                <p className="text-sm text-gray-600">AI Learning Path • Premium</p>
              </div>
            </div>
            <button
              onClick={changeCourse}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-2 rounded hover:bg-blue-50 transition-colors"
            >
              Change Subject
            </button>
          </div>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto bg-white p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <Lightbulb className="mx-auto mb-4 text-blue-600" size={48} />
                <p className="text-gray-500 max-w-md">Ask me anything about {selectedCourse.title} and I'll provide personalized guidance</p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <Bot className="flex-shrink-0 text-blue-600 mt-1" size={24} />
                )}
                <div
                  className={`max-w-2xl rounded-lg p-4 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {msg.content.split('\n').map((line, i) => (
                      <div key={i}>
                        {line.includes('**') ? (
                          <p className="font-semibold inline">
                            {line.replace(/\*\*/g, '')}
                          </p>
                        ) : (
                          line
                        )}
                      </div>
                    ))}
                  </div>
                  <p className={`text-xs mt-2 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <User className="flex-shrink-0 text-blue-600 mt-1" size={24} />
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3 justify-start">
              <Bot className="flex-shrink-0 text-blue-600 mt-1" size={24} />
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="bg-white rounded-b-2xl shadow-lg p-4 border-t border-gray-200">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about any topic, concept, or for study tips..."
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <Send size={20} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            💡 Tip: Ask specific questions like "Explain photosynthesis", "How do I solve quadratic equations?", or "What are exam prep strategies?"
          </p>
        </form>
      </div>
    </div>
  );
};

export default AILearningPath;
