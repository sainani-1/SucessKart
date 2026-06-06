import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useDataChannel,
  useLocalParticipant,
  useRoomContext,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { supabase } from '../supabaseClient';
import { controlLiveKitClassSession } from '../lib/livekitSession';
import {
  BarChart3,
  Ban,
  ChevronDown,
  ChevronUp,
  Expand,
  Hand,
  LayoutGrid,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  Pin,
  PhoneOff,
  ScreenShare,
  Send,
  ShieldCheck,
  UserMinus,
  Users,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';

const extractUserIdFromIdentity = (identity) => {
  const parts = String(identity || '').split(':');
  return parts.length >= 2 ? parts[1] : null;
};

const getInitials = (name) =>
  String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'SP';

const trackIdentity = (trackRef) =>
  `${trackRef?.participant?.identity || 'unknown'}:${trackRef?.source || 'track'}:${trackRef?.publication?.trackSid || 'placeholder'}`;

const isMicEnabled = (participant) => {
  const micPublication =
    participant?.getTrackPublication?.(Track.Source.Microphone) ||
    participant?.trackPublications?.get?.(Track.Source.Microphone);
  return Boolean(micPublication && !micPublication.isMuted);
};

const getCameraPublication = (participant) =>
  participant?.getTrackPublication?.(Track.Source.Camera) ||
  participant?.trackPublications?.get?.(Track.Source.Camera) ||
  null;

const getMicPublication = (participant) =>
  participant?.getTrackPublication?.(Track.Source.Microphone) ||
  participant?.trackPublications?.get?.(Track.Source.Microphone) ||
  null;

const getBreakoutRoomLabel = (breakout, userId) => {
  if (!userId) return '';
  const rooms = Array.isArray(breakout?.rooms) ? breakout.rooms : [];
  const activeRoom = rooms.find((room) => Array.isArray(room?.participant_user_ids) && room.participant_user_ids.map(String).includes(String(userId)));
  if (activeRoom?.name) return activeRoom.name;
  const lastLabels = breakout?.last_room_labels && typeof breakout.last_room_labels === 'object' ? breakout.last_room_labels : {};
  return String(lastLabels?.[userId] || '');
};

const getClassParticipantRoleLabel = ({ participant, userId, teacherIdentity, cohostUserIds }) => {
  if (participant?.identity === teacherIdentity) return 'Host';
  if (cohostUserIds.includes(String(userId || ''))) return 'Co-host';
  return participant?.isLocal ? 'You · Student/Participant' : 'Student/Participant';
};

const encodeData = (value) => new TextEncoder().encode(JSON.stringify(value));
const decodeData = (payload) => {
  try {
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return null;
  }
};

const formatDurationMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
};

const SessionBadge = ({ icon: Icon, label, value, accent = 'text-amber-200' }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 backdrop-blur">
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
      <Icon size={14} className={accent} />
      <span>{label}</span>
    </div>
    <p className="mt-2 text-sm font-semibold text-white">{value}</p>
  </div>
);

const StatusPill = ({ active, activeLabel, inactiveLabel, activeClass, inactiveClass, icon: Icon }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      active ? activeClass : inactiveClass
    }`}
  >
    <Icon size={12} />
    <span>{active ? activeLabel : inactiveLabel}</span>
  </span>
);

const ControlButton = ({ icon: Icon, label, onClick, danger = false, disabled = false, wide = false }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
      danger
        ? 'bg-rose-500 text-white hover:bg-rose-600 disabled:bg-rose-900/40'
        : 'bg-white/8 text-white hover:bg-white/14 disabled:bg-white/5'
    } ${wide ? 'w-full' : ''} disabled:cursor-not-allowed disabled:text-slate-500`}
  >
    <Icon size={14} />
    <span>{label}</span>
  </button>
);

const CollapsibleSection = ({ title, subtitle, badge, icon: Icon, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon ? <Icon size={15} className="text-amber-200" /> : null}
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{title}</p>
            {badge ? <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-slate-200">{badge}</span> : null}
          </div>
          {subtitle ? <p className="mt-2 text-sm text-slate-300">{subtitle}</p> : null}
        </div>
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/8 text-white">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {open ? <div className="border-t border-white/10 px-4 py-3">{children}</div> : null}
    </section>
  );
};

const AvatarFallback = ({ name, avatarUrl, large = false }) => (
  <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(160deg,_rgba(15,23,42,0.9),_rgba(30,41,59,0.95))]">
    {avatarUrl ? (
      <img
        src={avatarUrl}
        alt={name}
        className={`rounded-full object-cover ring-4 ring-white/10 ${large ? 'h-36 w-36 sm:h-44 sm:w-44' : 'h-20 w-20'}`}
      />
    ) : (
      <div
        className={`flex items-center justify-center rounded-full bg-amber-400/20 font-bold text-amber-100 ring-4 ring-white/10 ${
          large ? 'h-36 w-36 text-4xl sm:h-44 sm:w-44 sm:text-5xl' : 'h-20 w-20 text-2xl'
        }`}
      >
        {getInitials(name)}
      </div>
    )}
  </div>
);

const VideoSurface = ({ trackRef, displayName, avatarUrl, large = false }) => {
  const participant = trackRef?.participant;
  const isScreenShare = trackRef?.source === Track.Source.ScreenShare;
  const cameraPublication = getCameraPublication(participant);
  const hasVisibleVideo =
    isScreenShare ||
    Boolean(cameraPublication && !cameraPublication.isMuted && cameraPublication.isSubscribed !== false);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <ParticipantTile
        trackRef={trackRef}
        className={`h-full w-full overflow-hidden bg-slate-900/70 [&_.lk-participant-media-video]:h-full [&_.lk-participant-media-video]:w-full [&_.lk-participant-media-video]:object-center [&_.lk-participant-name]:hidden [&_.lk-participant-placeholder]:opacity-0 [&_.lk-video-container]:h-full [&_.lk-video-container]:w-full [&_video]:h-full [&_video]:w-full [&_video]:object-center ${
          isScreenShare
            ? '[&_.lk-participant-media-video]:object-contain [&_video]:object-contain'
            : '[&_.lk-participant-media-video]:object-cover [&_video]:object-cover'
        }`}
      />
      {!hasVisibleVideo ? <AvatarFallback name={displayName} avatarUrl={avatarUrl} large={large} /> : null}
    </div>
  );
};

const FullscreenButton = ({ containerRef }) => {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      className="inline-flex min-w-[128px] items-center justify-center gap-2 rounded-xl bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/14"
    >
      {isFullscreen ? <Minimize size={18} /> : <Expand size={18} />}
      <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
    </button>
  );
};

const LiveKitControls = ({ onLeave, onEndSession, canEndSession, containerRef, audioRestricted, videoRestricted }) => {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const [actionLoading, setActionLoading] = useState('');

  const toggleMicrophone = async () => {
    if (audioRestricted) return;
    setActionLoading('mic');
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setActionLoading('');
    }
  };

  const toggleCamera = async () => {
    if (videoRestricted) return;
    setActionLoading('camera');
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } finally {
      setActionLoading('');
    }
  };

  const toggleScreenShare = async () => {
    setActionLoading('screen');
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
    } finally {
      setActionLoading('');
    }
  };

  const leaveRoom = async () => {
    setActionLoading('leave');
    try {
      await room.disconnect();
    } finally {
      setActionLoading('');
      onLeave?.();
    }
  };

  const endSessionForAll = async () => {
    if (!canEndSession || !onEndSession) return;
    setActionLoading('end');
    try {
      await onEndSession();
    } finally {
      setActionLoading('');
    }
  };

  const controlClass = (active, danger = false) =>
    `inline-flex min-w-[128px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
      danger
        ? 'bg-rose-500 text-white hover:bg-rose-600'
        : active
          ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
          : 'bg-white/8 text-white hover:bg-white/14'
    }`;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 px-3 pb-3 sm:bottom-3 sm:px-5 sm:pb-5">
      <div className="pointer-events-auto mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/88 px-3 py-3 shadow-[0_20px_70px_rgba(2,8,23,0.48)] backdrop-blur-xl sm:gap-3 sm:px-4">
        <button type="button" onClick={toggleMicrophone} disabled={actionLoading === 'mic'} className={controlClass(isMicrophoneEnabled)}>
          {isMicrophoneEnabled ? <Mic size={18} /> : <MicOff size={18} />}
          <span>{audioRestricted ? 'Mic Locked' : isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
        </button>
        <button type="button" onClick={toggleCamera} disabled={actionLoading === 'camera'} className={controlClass(isCameraEnabled)}>
          {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
          <span>{videoRestricted ? 'Camera Locked' : isCameraEnabled ? 'Camera On' : 'Camera Off'}</span>
        </button>
        <button type="button" onClick={toggleScreenShare} disabled={actionLoading === 'screen'} className={controlClass(isScreenShareEnabled)}>
          {isScreenShareEnabled ? <ScreenShare size={18} /> : <MonitorUp size={18} />}
          <span>{isScreenShareEnabled ? 'Stop Share' : 'Share Screen'}</span>
        </button>
        <FullscreenButton containerRef={containerRef} />
        {canEndSession ? (
          <button type="button" onClick={endSessionForAll} disabled={actionLoading === 'end'} className={controlClass(false, true)}>
            <PhoneOff size={18} />
            <span>End Session for All</span>
          </button>
        ) : null}
        <button type="button" onClick={leaveRoom} disabled={actionLoading === 'leave'} className={controlClass(false, true)}>
          <PhoneOff size={18} />
          <span>Leave Class</span>
        </button>
      </div>
    </div>
  );
};

const ChatPanel = ({
  messages,
  draft,
  onDraftChange,
  onSend,
  canSend,
}) => (
  <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/72">
    <div className="border-b border-white/10 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Public Chat</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">Live class conversation</h4>
      </div>
    </div>
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.length ? (
        messages.map((message) => (
          <div key={message.id} className="rounded-2xl bg-white/[0.04] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-amber-200">{message.name}</p>
              <span className="text-[10px] text-slate-500">{message.time}</span>
            </div>
            <p className="mt-1 text-sm text-slate-100">{message.text}</p>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-400">No chat yet. Start the live class conversation here.</p>
      )}
    </div>
    <div className="border-t border-white/10 p-3">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={canSend ? 'Send a message to everyone' : 'Chat is read-only right now'}
          disabled={!canSend}
          className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend || !draft.trim()}
          className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  </div>
);

const ReactionBurst = ({ reactions }) => (
  <div className="pointer-events-none absolute right-6 top-28 z-30 flex w-48 flex-col items-end gap-2">
    {reactions.map((reaction) => (
      <div key={reaction.id} className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white shadow-lg backdrop-blur">
        <span className="mr-2 text-lg">{reaction.emoji}</span>
        <span className="font-semibold">{reaction.name}</span>
      </div>
    ))}
  </div>
);

const BreakoutPanel = ({
  breakout,
  profilesByUserId,
  canManageParticipants,
  onStartAuto,
  onCloseBreakouts,
  onJumpToRoom,
  onBroadcast,
}) => {
  const [message, setMessage] = useState('');
  const rooms = Array.isArray(breakout?.rooms) ? breakout.rooms : [];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Breakout Rooms</p>
          <p className="mt-1 text-sm text-white">{breakout?.active ? 'Breakouts are live' : 'Main room only'}</p>
        </div>
        {canManageParticipants ? (
          breakout?.active ? (
            <button type="button" onClick={onCloseBreakouts} className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white">
              Pull Back All
            </button>
          ) : (
            <button type="button" onClick={() => onStartAuto(2)} className="rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-slate-950">
              Start 2 Rooms
            </button>
          )
        ) : null}
      </div>
      {breakout?.active ? (
        <>
          <div className="mt-3 grid gap-2">
            {rooms.map((room) => (
              <div key={room.id} className="rounded-xl bg-white/[0.04] px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{room.name}</p>
                    <p className="text-xs text-slate-400">
                      {(room.participant_user_ids || []).map((id) => profilesByUserId[id]?.full_name || profilesByUserId[id]?.email || 'Student').join(', ') || 'No students yet'}
                    </p>
                  </div>
                  {canManageParticipants ? (
                    <button type="button" onClick={() => onJumpToRoom(room.id)} className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white">
                      Jump
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {canManageParticipants ? (
            <div className="mt-3 flex gap-2">
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Broadcast to all breakout rooms"
                className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  onBroadcast(message);
                  setMessage('');
                }}
                disabled={!message.trim()}
                className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-500"
              >
                Send
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

const PollPanel = ({
  canManageParticipants,
  polls,
  pollVotes,
  currentUserId,
  composer,
  onComposerChange,
  onCreatePoll,
  onVotePoll,
  onClosePoll,
}) => {
  const activePoll = polls.find((poll) => poll.status === 'live') || polls[0] || null;
  const options = Array.isArray(activePoll?.options) ? activePoll.options : [];
  const composerOptions = composer.optionsText
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const voteRows = activePoll ? pollVotes.filter((vote) => vote.poll_id === activePoll.id) : [];
  const groupedVotes = options.map((option, index) => ({
    option,
    index,
    count: voteRows.filter((vote) => Number(vote.option_index) === index).length,
  }));
  const totalVotes = groupedVotes.reduce((sum, entry) => sum + entry.count, 0);
  const myVotes = voteRows.filter((vote) => vote.user_id === currentUserId).map((vote) => Number(vote.option_index));
  const quizMode = activePoll && activePoll.correct_option_index !== null && activePoll.correct_option_index !== undefined;
  const remainingMs = activePoll?.ends_at ? new Date(activePoll.ends_at).getTime() - Date.now() : 0;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const countdownLabel =
    remainingSeconds > 0
      ? `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`
      : '00:00';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Polls And Quiz</p>
          <p className="mt-1 text-sm text-white">{activePoll ? activePoll.question : 'Create a live poll or timed quiz for the class'}</p>
        </div>
        <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-slate-200">
          {polls.length} poll{polls.length === 1 ? '' : 's'}
        </span>
      </div>

      {canManageParticipants ? (
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/55 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onComposerChange((current) => ({ ...current, type: 'poll', correctOptionIndex: '' }))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${composer.type === 'poll' ? 'bg-amber-400 text-slate-950' : 'bg-white/8 text-white'}`}
            >
              Poll
            </button>
            <button
              type="button"
              onClick={() => onComposerChange((current) => ({ ...current, type: 'quiz', allowMultiple: false }))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${composer.type === 'quiz' ? 'bg-amber-400 text-slate-950' : 'bg-white/8 text-white'}`}
            >
              Timed Quiz
            </button>
          </div>
          <input
            value={composer.question}
            onChange={(event) => onComposerChange((current) => ({ ...current, question: event.target.value }))}
            placeholder={composer.type === 'quiz' ? 'Ask a timed quiz question' : 'Ask a live MCQ question'}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          />
          <textarea
            value={composer.optionsText}
            onChange={(event) => onComposerChange((current) => ({ ...current, optionsText: event.target.value }))}
            placeholder={'Enter one option per line\nOption A\nOption B\nOption C'}
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
          />
          {composer.type === 'quiz' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={composer.correctOptionIndex}
                onChange={(event) => onComposerChange((current) => ({ ...current, correctOptionIndex: event.target.value }))}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none"
              >
                <option value="">Correct option</option>
                {composerOptions.map((option, index) => (
                  <option key={`${option}-${index}`} value={index}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                value={composer.durationMinutes}
                onChange={(event) => onComposerChange((current) => ({ ...current, durationMinutes: event.target.value }))}
                placeholder="Timer in minutes"
                inputMode="numeric"
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            {composer.type === 'poll' ? (
              <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={composer.allowMultiple}
                  onChange={(event) => onComposerChange((current) => ({ ...current, allowMultiple: event.target.checked }))}
                  className="rounded border-white/20 bg-white/10"
                />
                Allow multiple choices
              </label>
            ) : (
              <p className="text-xs text-slate-400">Quiz mode locks to one correct answer and optional timer.</p>
            )}
            <button
              type="button"
              onClick={onCreatePoll}
              className="rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
            >
              {composer.type === 'quiz' ? 'Launch Quiz' : 'Launch Poll'}
            </button>
          </div>
        </div>
      ) : null}

      {activePoll ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${quizMode ? 'bg-fuchsia-400/15 text-fuchsia-200' : 'bg-sky-400/15 text-sky-200'}`}>
                {quizMode ? 'Timed Quiz' : 'Poll'}
              </span>
              {activePoll.status === 'live' && activePoll.ends_at ? (
                <span className="rounded-full bg-white/8 px-3 py-1 text-[11px] font-semibold text-white">
                  Ends in {countdownLabel}
                </span>
              ) : null}
            </div>
            <span className="text-[11px] text-slate-400">{totalVotes} responses</span>
          </div>
          {groupedVotes.map((entry) => {
            const percent = totalVotes ? Math.round((entry.count / totalVotes) * 100) : 0;
            const selected = myVotes.includes(entry.index);
            const correct = quizMode && Number(activePoll.correct_option_index) === entry.index;
            return (
              <button
                key={`${activePoll.id}-${entry.index}`}
                type="button"
                onClick={() => onVotePoll(activePoll, entry.index)}
                disabled={activePoll.status !== 'live'}
                className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                  selected
                    ? 'border-amber-300 bg-amber-400/12'
                    : correct && activePoll.status !== 'live'
                      ? 'border-emerald-300/40 bg-emerald-400/10'
                    : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'
                } disabled:cursor-not-allowed`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-white">
                    {entry.option}
                    {correct && activePoll.status !== 'live' ? ' · Correct' : ''}
                  </span>
                  <span className="text-xs text-slate-300">{entry.count} votes</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{percent}%</p>
              </button>
            );
          })}
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-slate-400">
              {activePoll.status === 'live'
                ? quizMode
                  ? 'Quiz answers update instantly. Correct answer appears after close.'
                  : 'Votes update instantly for everyone.'
                : quizMode
                  ? 'Quiz is closed. Correct answer is highlighted.'
                  : 'This poll is closed.'}
            </p>
            {canManageParticipants && activePoll.status === 'live' ? (
              <button
                type="button"
                onClick={() => onClosePoll(activePoll.id)}
                className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/14"
              >
                Close Poll
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-400">No live poll or quiz yet.</p>
      )}

      {polls.length > 1 ? (
        <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Recent Polls</p>
          <div className="mt-2 space-y-2">
            {polls.slice(0, 3).map((poll) => (
              <div key={poll.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-200">{poll.question}</span>
                <span className="text-slate-500">{poll.status}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const QAPanel = ({
  canManageParticipants,
  questions,
  questionVotes,
  profilesByUserId,
  currentUserId,
  draft,
  onDraftChange,
  onAsk,
  onToggleUpvote,
  onPinQuestion,
  onAnswerQuestion,
  onDismissQuestion,
}) => {
  const visibleQuestions = canManageParticipants ? questions : questions.filter((question) => question.status !== 'dismissed');

  return (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Q&A Panel</p>
        <p className="mt-1 text-sm text-white">Students can ask, upvote, and follow teacher answers here.</p>
      </div>
      <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-slate-200">
        {questions.length} question{questions.length === 1 ? '' : 's'}
      </span>
    </div>

    <div className="mt-3 flex gap-2">
      <input
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="Ask a question for the class"
        className="flex-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
      />
      <button
        type="button"
        onClick={onAsk}
        disabled={!draft.trim()}
        className="inline-flex h-12 items-center justify-center rounded-2xl bg-amber-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
      >
        Ask
      </button>
    </div>

    <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
      {visibleQuestions.length ? (
        visibleQuestions.map((question) => {
          const author = profilesByUserId[question.user_id];
          const upvoteCount = questionVotes.filter((vote) => vote.question_id === question.id).length;
          const liked = questionVotes.some((vote) => vote.question_id === question.id && vote.user_id === currentUserId);
          const answeredBy = question.answered_by ? profilesByUserId[question.answered_by] : null;

          return (
            <div key={question.id} className={`rounded-2xl border px-3 py-3 ${question.is_pinned ? 'border-amber-300/40 bg-amber-400/8' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{author?.full_name || author?.email || 'Student'}</p>
                    {question.is_pinned ? (
                      <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-semibold text-slate-950">Pinned</span>
                    ) : null}
                    {question.status === 'answered' ? (
                      <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-semibold text-emerald-200">Answered</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-100">{question.question}</p>
                  {question.answer_text ? (
                    <div className="mt-3 rounded-xl bg-slate-950/65 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                        Answer{answeredBy ? ` by ${answeredBy.full_name || answeredBy.email}` : ''}
                      </p>
                      <p className="mt-1 text-sm text-slate-200">{question.answer_text}</p>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onToggleUpvote(question)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${liked ? 'bg-fuchsia-400 text-slate-950' : 'bg-white/8 text-white hover:bg-white/14'}`}
                >
                  {liked ? 'Upvoted' : 'Upvote'} · {upvoteCount}
                </button>
              </div>

              {canManageParticipants ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onPinQuestion(question)}
                    className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/14"
                  >
                    {question.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAnswerQuestion(question)}
                    className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/25"
                  >
                    {question.answer_text ? 'Edit Answer' : 'Answer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissQuestion(question)}
                    className="rounded-full bg-rose-400/15 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/25"
                  >
                    {question.status === 'dismissed' ? 'Reopen' : 'Dismiss'}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <p className="text-sm text-slate-400">No questions yet.</p>
      )}
    </div>
  </div>
  );
};

const AnalyticsPanel = ({ stats, profilesByUserId, currentUserId }) => {
  const rankedBySpeaking = [...stats]
    .sort((a, b) => Number(b.speaking_seconds || 0) - Number(a.speaking_seconds || 0))
    .slice(0, 4);
  const rankedByEngagement = [...stats]
    .sort(
      (a, b) =>
        Number(b.chat_messages_count || 0) +
        Number(b.reactions_count || 0) +
        Number(b.hand_raise_count || 0) -
        (Number(a.chat_messages_count || 0) + Number(a.reactions_count || 0) + Number(a.hand_raise_count || 0)),
    )
    .slice(0, 4);
  const focusAlerts = stats.filter((entry) => Number(entry.focus_loss_count || 0) > 0).length;
  const myStats = stats.find((entry) => entry.user_id === currentUserId) || null;

  const resolveName = (userId) => profilesByUserId[userId]?.full_name || profilesByUserId[userId]?.email || 'Participant';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Class Analytics</p>
          <p className="mt-1 text-sm text-white">Live speaking, engagement, and focus signals for this class.</p>
        </div>
        <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-slate-200">
          {stats.length} tracked
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-white/[0.04] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Top Speaker</p>
          <p className="mt-1 text-sm font-semibold text-white">
            {rankedBySpeaking[0] ? resolveName(rankedBySpeaking[0].user_id) : 'No one yet'}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.04] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Focus Alerts</p>
          <p className="mt-1 text-sm font-semibold text-white">{focusAlerts}</p>
        </div>
        <div className="rounded-xl bg-white/[0.04] px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Your Speaking</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatDurationMinutes(Math.round(Number(myStats?.speaking_seconds || 0) / 60))}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-950/55 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Speaking Leaderboard</p>
          <div className="mt-2 space-y-2">
            {rankedBySpeaking.length ? (
              rankedBySpeaking.map((entry, index) => (
                <div key={`speak-${entry.user_id}`} className="flex items-center justify-between text-sm">
                  <span className="text-white">{index + 1}. {resolveName(entry.user_id)}</span>
                  <span className="text-slate-300">{formatDurationMinutes(Math.round(Number(entry.speaking_seconds || 0) / 60))}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Speaking analytics will appear once participants start talking.</p>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-slate-950/55 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Engagement Leaderboard</p>
          <div className="mt-2 space-y-2">
            {rankedByEngagement.length ? (
              rankedByEngagement.map((entry, index) => (
                <div key={`engage-${entry.user_id}`} className="flex items-center justify-between text-sm">
                  <span className="text-white">{index + 1}. {resolveName(entry.user_id)}</span>
                  <span className="text-slate-300">
                    {Number(entry.chat_messages_count || 0) + Number(entry.reactions_count || 0) + Number(entry.hand_raise_count || 0)} pts
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Engagement analytics will appear after class interactions.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const RecordingPanel = ({ canManageParticipants, recordings, onToggleRecording }) => {
  const activeRecording = recordings.find((entry) => entry.status === 'recording') || null;
  const recentRecording = activeRecording || recordings[0] || null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Recording Status</p>
          <p className="mt-1 text-sm text-white">
            {activeRecording ? 'Session recording log is active' : 'Recording is currently idle'}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${activeRecording ? 'bg-rose-400/15 text-rose-200' : 'bg-white/8 text-slate-200'}`}>
          {activeRecording ? 'Recording' : 'Idle'}
        </span>
      </div>

      {canManageParticipants ? (
        <button
          type="button"
          onClick={onToggleRecording}
          className={`mt-3 rounded-full px-4 py-2 text-sm font-semibold transition ${activeRecording ? 'bg-rose-500 text-white hover:bg-rose-600' : 'bg-amber-400 text-slate-950 hover:bg-amber-300'}`}
        >
          {activeRecording ? 'Stop Recording Log' : 'Start Recording Log'}
        </button>
      ) : null}

      {recentRecording ? (
        <div className="mt-3 rounded-xl bg-slate-950/55 p-3 text-sm">
          <p className="text-white">Mode: <span className="text-slate-300">{recentRecording.recording_mode}</span></p>
          <p className="mt-1 text-white">Started: <span className="text-slate-300">{recentRecording.started_at ? new Date(recentRecording.started_at).toLocaleString('en-IN') : 'Not started'}</span></p>
          <p className="mt-1 text-white">Stopped: <span className="text-slate-300">{recentRecording.stopped_at ? new Date(recentRecording.stopped_at).toLocaleString('en-IN') : 'Still running'}</span></p>
          <p className="mt-2 text-xs text-slate-400">
            This logs recording state now, so cloud media storage can be attached later without changing the classroom workflow.
          </p>
        </div>
      ) : null}
    </div>
  );
};

const RaisedHandsPanel = ({ raisedHands, profilesByUserId, onQueueUpdate, onLowerHand, speakerQueue, canManageParticipants }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
    <div className="flex items-center gap-2">
      <Hand size={15} className="text-amber-200" />
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Raised Hands</p>
    </div>
    <div className="mt-3 space-y-2">
      {raisedHands.length ? (
        raisedHands.map((raisedUserId, index) => {
          const profile = profilesByUserId[raisedUserId];
          const alreadyQueued = speakerQueue.includes(raisedUserId);
          return (
            <div key={raisedUserId} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
              <span className="text-white">
                {index + 1}. {profile?.full_name || profile?.email || 'Student'}
              </span>
              {canManageParticipants ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onQueueUpdate(
                        alreadyQueued
                          ? speakerQueue.filter((entry) => entry !== raisedUserId)
                          : [...speakerQueue.filter((entry) => entry !== raisedUserId), raisedUserId],
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      alreadyQueued ? 'bg-fuchsia-400 text-slate-950' : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    {alreadyQueued ? 'Remove From Queue' : 'Add To Queue'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLowerHand(raisedUserId)}
                    className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/14"
                  >
                    Lower
                  </button>
                </div>
              ) : null}
            </div>
          );
        })
      ) : (
        <p className="text-sm text-slate-400">No raised hands right now.</p>
      )}
    </div>
  </div>
);

const ScrollButtons = ({ targetRef, className = '' }) => {
  const scrollByAmount = (direction) => {
    const node = targetRef.current;
    if (!node) return;
    node.scrollBy({
      top: direction * Math.max(220, Math.round(node.clientHeight * 0.7)),
      behavior: 'smooth',
    });
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => scrollByAmount(-1)}
        className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/14"
      >
        Scroll Up
      </button>
      <button
        type="button"
        onClick={() => scrollByAmount(1)}
        className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-white transition hover:bg-white/14"
      >
        Scroll Down
      </button>
    </div>
  );
};

const RailActionChips = ({ onReaction }) => (
  <div className="flex flex-wrap gap-2">
    {[
      { emoji: '👍', label: 'Like' },
      { emoji: '👏', label: 'Clap' },
      { emoji: '😂', label: 'Laugh' },
      { emoji: '✅', label: 'Yes' },
      { emoji: '❓', label: 'Question' },
    ].map((reaction) => (
      <button
        key={reaction.label}
        type="button"
        onClick={() => onReaction(reaction.emoji)}
        className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/14"
      >
        <span>{reaction.emoji}</span>
        <span>{reaction.label}</span>
      </button>
    ))}
  </div>
);

const ParticipantsPopup = ({
  open,
  onClose,
  participants,
  profilesByUserId,
  spotlightIdentity,
  roomLocked,
  restrictedAudioUserIds,
  restrictedVideoUserIds,
  waitingRoomEnabled,
  privateParticipantsEnabled,
  waitingUserIds,
  cohostUserIds,
  teacherIdentity,
  breakoutRooms,
  raisedHands,
  speakerQueue,
  allowedSpeakerUserIds,
  pinnedParticipantIds,
  canManageParticipants,
  canManageCoHosts,
  onQueueUpdate,
  onAllowSpeaker,
  onPinToggle,
  onAssignBreakout,
  onAction,
}) => {
  const [pendingAction, setPendingAction] = useState('');
  const popupScrollRef = useRef(null);

  if (!open) return null;

  const runAction = async (action, target = {}) => {
    const key = `${action}:${target.targetIdentity || 'all'}`;
    setPendingAction(key);
    try {
      await onAction(action, target);
    } finally {
      setPendingAction('');
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[84vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 shadow-[0_30px_100px_rgba(15,23,42,0.65)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">Participants Control</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Manage students in class</h3>
          </div>
          <div className="flex items-center gap-2">
            <ScrollButtons targetRef={popupScrollRef} />
            <ControlButton
              icon={Lock}
              label={roomLocked ? 'Unlock Room' : 'Lock Room'}
              onClick={() => runAction(roomLocked ? 'unlock_room' : 'lock_room')}
              disabled={pendingAction === `${roomLocked ? 'unlock_room' : 'lock_room'}:all`}
            />
            <ControlButton
              icon={Users}
              label={waitingRoomEnabled ? 'Waiting Required' : 'Direct Join On'}
              onClick={() => runAction('toggle_waiting_room')}
              disabled={pendingAction === 'toggle_waiting_room:all'}
            />
            <ControlButton
              icon={Video}
              label={privateParticipantsEnabled ? 'Private View On' : 'Private View Off'}
              onClick={() => runAction('toggle_private_participants')}
              disabled={pendingAction === 'toggle_private_participants:all'}
            />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-white transition hover:bg-white/14"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {waitingUserIds.length > 0 ? (
          <div className="border-b border-white/10 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Waiting Room</p>
            <div className="grid gap-2 md:grid-cols-2">
              {waitingUserIds.map((waitingUserId) => {
                const waitingProfile = profilesByUserId[waitingUserId] || {};
                return (
                  <div key={waitingUserId} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{waitingProfile.full_name || waitingProfile.email || 'Waiting student'}</p>
                      <p className="text-xs text-slate-400">Needs host approval</p>
                    </div>
                    <ControlButton
                      icon={Users}
                      label="Allow"
                      onClick={() => runAction('admit_participant', { targetUserId: waitingUserId })}
                      disabled={pendingAction === `admit_participant:all`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="border-b border-white/10 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <ControlButton
              icon={MicOff}
              label="Mute All Students"
              onClick={() => runAction('mute_all_students')}
              wide
              disabled={pendingAction === 'mute_all_students:all'}
            />
            <ControlButton
              icon={VideoOff}
              label="Disable All Cameras"
              onClick={() => runAction('disable_all_student_cameras')}
              wide
              disabled={pendingAction === 'disable_all_student_cameras:all'}
            />
            <ControlButton
              icon={Users}
              label="Teacher Default Spotlight"
              onClick={() => runAction('clear_spotlight')}
              wide
              disabled={pendingAction === 'clear_spotlight:all'}
            />
          </div>
        </div>

        <div ref={popupScrollRef} className="grid gap-3 overflow-y-auto p-4 md:grid-cols-2 scroll-smooth">
          {participants.map((trackRef) => {
            const participant = trackRef.participant;
            if (participant?.isLocal) return null;

            const userId = extractUserIdFromIdentity(participant?.identity);
            const profile = profilesByUserId[userId] || null;
            const displayName = profile?.full_name || participant?.name || participant?.identity || 'Participant';
            const avatarUrl = profile?.avatar_url || '';
            const micOn = isMicEnabled(participant);
            const cameraPublication = getCameraPublication(participant);
            const spotlighted = spotlightIdentity === participant?.identity;
            const audioRestricted = restrictedAudioUserIds.includes(userId);
            const videoRestricted = restrictedVideoUserIds.includes(userId);
            const raisedHand = raisedHands.includes(userId);
            const queued = speakerQueue.includes(userId);
            const speakingAllowed = allowedSpeakerUserIds.length === 0 || allowedSpeakerUserIds.includes(userId);
            const pinned = pinnedParticipantIds.includes(participant.identity);
            const cohost = cohostUserIds.includes(userId);
            const roleLabel = getClassParticipantRoleLabel({
              participant,
              userId,
              teacherIdentity,
              cohostUserIds,
            });
            const roomLabel = getBreakoutRoomLabel({ rooms: breakoutRooms }, userId);

            return (
              <div key={trackIdentity(trackRef)} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
                <div className="relative h-48">
                  <VideoSurface trackRef={trackRef} displayName={displayName} avatarUrl={avatarUrl} />
                </div>
                <div className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                      <p className="mt-1 text-xs text-slate-400">{roleLabel}</p>
                    </div>
                    {spotlighted ? (
                      <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">
                        Spotlighted
                      </span>
                    ) : null}
                    {cohost ? (
                      <span className="rounded-full bg-cyan-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">
                        Co-host
                      </span>
                    ) : null}
                    {roleLabel === 'Host' ? (
                      <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">
                        Host
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {raisedHand ? (
                      <StatusPill
                        active
                        activeLabel="Hand raised"
                        inactiveLabel="Hand lowered"
                        activeClass="bg-amber-400/15 text-amber-200"
                        inactiveClass="bg-slate-700 text-slate-300"
                        icon={Hand}
                      />
                    ) : null}
                    {roomLabel ? (
                      <StatusPill
                        active
                        activeLabel={roomLabel}
                        inactiveLabel="Main room"
                        activeClass="bg-sky-400/15 text-sky-200"
                        inactiveClass="bg-slate-700 text-slate-300"
                        icon={Users}
                      />
                    ) : null}
                    {queued ? (
                      <StatusPill
                        active
                        activeLabel={`Queue #${speakerQueue.indexOf(userId) + 1}`}
                        inactiveLabel="Not queued"
                        activeClass="bg-fuchsia-400/15 text-fuchsia-200"
                        inactiveClass="bg-slate-700 text-slate-300"
                        icon={MessageSquare}
                      />
                    ) : null}
                    <StatusPill
                      active={micOn}
                      activeLabel="Unmuted"
                      inactiveLabel="Muted"
                      activeClass="bg-emerald-400/15 text-emerald-200"
                      inactiveClass="bg-rose-400/15 text-rose-200"
                      icon={micOn ? Mic : MicOff}
                    />
                    <StatusPill
                      active={!cameraPublication?.isMuted}
                      activeLabel="Camera on"
                      inactiveLabel="Camera off"
                      activeClass="bg-sky-400/15 text-sky-200"
                      inactiveClass="bg-slate-700 text-slate-300"
                      icon={Video}
                    />
                    <StatusPill
                      active={speakingAllowed}
                      activeLabel="Can speak"
                      inactiveLabel="Read-only"
                      activeClass="bg-emerald-400/15 text-emerald-200"
                      inactiveClass="bg-slate-700 text-slate-300"
                      icon={speakingAllowed ? Mic : MicOff}
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {canManageParticipants ? (
                      <>
                        <ControlButton
                          icon={queued ? MessageSquare : Hand}
                          label={queued ? 'Remove From Queue' : 'Add To Queue'}
                          onClick={() =>
                            onQueueUpdate(
                              queued
                                ? speakerQueue.filter((entry) => entry !== userId)
                                : [...speakerQueue.filter((entry) => entry !== userId), userId],
                            )
                          }
                          disabled={pendingAction.includes(participant.identity || '')}
                        />
                        <ControlButton
                          icon={speakingAllowed ? MicOff : Mic}
                          label={speakingAllowed ? 'Disallow Speaking' : 'Allow Speaking'}
                          onClick={() => onAllowSpeaker(userId)}
                          disabled={pendingAction.includes(participant.identity || '')}
                        />
                        <ControlButton
                          icon={pinned ? Pin : Pin}
                          label={pinned ? 'Unpin' : 'Pin To Focus'}
                          onClick={() => onPinToggle(participant.identity)}
                          disabled={pendingAction.includes(participant.identity || '')}
                        />
                        {canManageCoHosts ? (
                          <ControlButton
                            icon={ShieldCheck}
                            label={cohost ? 'Remove Co-host' : 'Make Co-host'}
                            onClick={() => runAction(cohost ? 'revoke_cohost' : 'grant_cohost', {
                              targetIdentity: participant.identity,
                              targetUserId: userId,
                            })}
                            disabled={pendingAction.includes(participant.identity || '')}
                          />
                        ) : null}
                        {breakoutRooms?.length ? (
                          <select
                            defaultValue=""
                            onChange={(event) => {
                              if (event.target.value) onAssignBreakout(userId, event.target.value);
                            }}
                            className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white outline-none"
                          >
                            <option value="">Move to breakout...</option>
                            {breakoutRooms.map((room) => (
                              <option key={room.id} value={room.id}>
                                {room.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </>
                    ) : null}
                    <ControlButton
                      icon={Users}
                      label={spotlighted ? 'Clear Spotlight' : 'Spotlight For All'}
                      onClick={() =>
                        runAction(spotlighted ? 'clear_spotlight' : 'set_spotlight', {
                          targetIdentity: participant.identity,
                          targetUserId: userId,
                        })
                      }
                      disabled={pendingAction.includes(participant.identity || '')}
                    />
                    <ControlButton
                      icon={audioRestricted ? Mic : MicOff}
                      label={audioRestricted ? 'Enable Mic' : 'Disable Mic'}
                      onClick={() =>
                        runAction(audioRestricted ? 'unmute_participant' : 'mute_participant', {
                          targetIdentity: participant.identity,
                          targetUserId: userId,
                        })
                      }
                      disabled={pendingAction.includes(participant.identity || '')}
                    />
                    <ControlButton
                      icon={videoRestricted ? Video : VideoOff}
                      label={videoRestricted ? 'Enable Camera' : 'Disable Camera'}
                      onClick={() =>
                        runAction(videoRestricted ? 'enable_camera_participant' : 'disable_camera_participant', {
                          targetIdentity: participant.identity,
                          targetUserId: userId,
                        })
                      }
                      disabled={pendingAction.includes(participant.identity || '')}
                    />
                    <ControlButton
                      icon={UserMinus}
                      label="Kick Out"
                      onClick={() =>
                        runAction('kick_participant', {
                          targetIdentity: participant.identity,
                          targetUserId: userId,
                        })
                      }
                      danger
                      disabled={pendingAction.includes(participant.identity || '')}
                    />
                    <div className="sm:col-span-2">
                      <ControlButton
                        icon={Ban}
                        label="Ban And Remove"
                        onClick={() =>
                          runAction('ban_participant', {
                            targetIdentity: participant.identity,
                            targetUserId: userId,
                          })
                        }
                        danger
                        wide
                        disabled={pendingAction.includes(participant.identity || '')}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const ClassroomLayout = ({ sessionId, currentRole, currentUserProfile, classSession, containerRef, onToast }) => {
  const cameraTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const shareTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [participantsPopupOpen, setParticipantsPopupOpen] = useState(false);
  const [profilesByUserId, setProfilesByUserId] = useState({});
  const [chatDraft, setChatDraft] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [reactionBursts, setReactionBursts] = useState([]);
  const [pollComposer, setPollComposer] = useState({
    type: 'poll',
    question: '',
    optionsText: 'Yes\nNo',
    allowMultiple: false,
    durationMinutes: '',
    correctOptionIndex: '',
  });
  const [polls, setPolls] = useState([]);
  const [pollVotes, setPollVotes] = useState([]);
  const [qaDraft, setQaDraft] = useState('');
  const [questions, setQuestions] = useState([]);
  const [questionVotes, setQuestionVotes] = useState([]);
  const [attendanceEntries, setAttendanceEntries] = useState([]);
  const [participantStats, setParticipantStats] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [railTab, setRailTab] = useState('people');
  const [collabState, setCollabState] = useState({
    raisedHands: [],
    speakerQueue: [],
    allowedSpeakerUserIds: [],
    pinnedParticipantIds: [],
    teacherViewMode: 'speaker',
  });
  const joinTimestampRef = useRef('');
  const participantRailRef = useRef(null);
  const speakingStateRef = useRef({ active: false, startedAt: 0 });
  const screenShareStateRef = useRef({ active: false, startedAt: 0 });
  const focusLostRef = useRef(false);
  const previousCohostStateRef = useRef(null);

  const controls = classSession?.livekit_controls || {};
  const cohostUserIds = Array.isArray(controls?.cohost_user_ids) ? controls.cohost_user_ids.map(String) : [];
  const waitingUserIds = Array.isArray(controls?.waiting_user_ids) ? controls.waiting_user_ids.map(String) : [];
  const waitingRoomEnabled = controls?.waiting_room_enabled !== false;
  const privateParticipantsEnabled = controls?.private_participants_enabled !== false;
  const userId = currentUserProfile?.id || '';
  const isCohost = cohostUserIds.includes(userId);
  const canManageParticipants = currentRole === 'teacher' || currentRole === 'admin' || isCohost;
  const canManageCoHosts = currentRole === 'admin' || classSession?.teacher_id === currentUserProfile?.id;
  const spotlightIdentity = String(controls?.spotlight_identity || '').trim();
  const persistedRaisedHandUserIds = Array.isArray(controls?.raised_hand_user_ids) ? controls.raised_hand_user_ids.map(String) : [];
  const persistedSpeakerQueueUserIds = Array.isArray(controls?.speaker_queue_user_ids) ? controls.speaker_queue_user_ids.map(String) : [];
  const persistedAllowedSpeakerUserIds = Array.isArray(controls?.allowed_speaker_user_ids) ? controls.allowed_speaker_user_ids.map(String) : [];
  const roomLocked = Boolean(controls?.room_locked);
  const restrictedAudioUserIds = Array.isArray(controls?.restricted_audio_user_ids) ? controls.restricted_audio_user_ids.map(String) : [];
  const restrictedVideoUserIds = Array.isArray(controls?.restricted_video_user_ids) ? controls.restricted_video_user_ids.map(String) : [];
  const audioRestricted = restrictedAudioUserIds.includes(currentUserProfile?.id);
  const videoRestricted = restrictedVideoUserIds.includes(currentUserProfile?.id);
  const isSpeakingAllowed =
    canManageParticipants ||
    collabState.allowedSpeakerUserIds.length === 0 ||
    collabState.allowedSpeakerUserIds.includes(userId);
  const speakingLocked = audioRestricted || !isSpeakingAllowed;
  const breakout = controls?.breakout && typeof controls.breakout === 'object' ? controls.breakout : { active: false, rooms: [] };

  const loadEngagement = useCallback(async () => {
    const [
      { data: pollRows },
      { data: pollVoteRows },
      { data: questionRows },
      { data: questionVoteRows },
      { data: attendanceRows },
      { data: statsRows },
      { data: recordingRows },
    ] = await Promise.all([
      supabase.from('class_session_live_polls').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }),
      supabase.from('class_session_live_poll_votes').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }),
      supabase
        .from('class_session_live_questions')
        .select('*')
        .eq('session_id', sessionId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('class_session_live_question_votes')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false }),
      supabase.from('class_attendance').select('id, student_id, join_time, leave_time, live_minutes, attended').eq('session_id', sessionId),
      supabase.from('class_session_live_participant_stats').select('*').eq('session_id', sessionId).order('updated_at', { ascending: false }),
      supabase.from('class_session_recordings').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }),
    ]);

    setPolls(pollRows || []);
    setPollVotes(pollVoteRows || []);
    setQuestions(questionRows || []);
    setQuestionVotes(questionVoteRows || []);
    setAttendanceEntries(attendanceRows || []);
    setParticipantStats(statsRows || []);
    setRecordings(recordingRows || []);
  }, [sessionId, setPolls, setPollVotes, setQuestions, setQuestionVotes, setAttendanceEntries, setParticipantStats, setRecordings]);

  useEffect(() => {
    setCollabState((current) => ({
      ...current,
      raisedHands: persistedRaisedHandUserIds,
      speakerQueue: persistedSpeakerQueueUserIds,
      allowedSpeakerUserIds: persistedAllowedSpeakerUserIds,
    }));
  }, [controls?.raised_hand_user_ids, controls?.speaker_queue_user_ids, controls?.allowed_speaker_user_ids]);

  useEffect(() => {
    if (!currentUserProfile?.id) return;
    if (previousCohostStateRef.current === null) {
      previousCohostStateRef.current = isCohost;
      return;
    }
    if (previousCohostStateRef.current === isCohost) return;
    previousCohostStateRef.current = isCohost;
    onToast?.(
      isCohost
        ? 'You are now a co-host. You can admit waiting students and help with basic class controls.'
        : 'Your co-host access was removed by the host.'
    );
  }, [isCohost, currentUserProfile?.id, onToast]);

  const { send: sendCollabEvent } = useDataChannel('classroom-events', (message) => {
    const payload = decodeData(message.payload);
    if (!payload?.type) return;

    setCollabState((current) => {
      switch (payload.type) {
        case 'raise_hand':
          return {
            ...current,
            raisedHands: current.raisedHands.includes(payload.userId)
              ? current.raisedHands
              : [...current.raisedHands, payload.userId],
          };
        case 'lower_hand':
          return {
            ...current,
            raisedHands: current.raisedHands.filter((entry) => entry !== payload.userId),
          };
        case 'set_queue':
          return {
            ...current,
            speakerQueue: Array.isArray(payload.queue) ? payload.queue : current.speakerQueue,
          };
        case 'set_allowed_speakers':
          return {
            ...current,
            allowedSpeakerUserIds: Array.isArray(payload.allowedSpeakerUserIds) ? payload.allowedSpeakerUserIds : [],
          };
        case 'toggle_pin':
          return {
            ...current,
            pinnedParticipantIds: current.pinnedParticipantIds.includes(payload.identity)
              ? current.pinnedParticipantIds.filter((entry) => entry !== payload.identity)
              : [...current.pinnedParticipantIds, payload.identity],
          };
        case 'set_view_mode':
          return {
            ...current,
            teacherViewMode: payload.viewMode === 'grid' ? 'grid' : 'speaker',
          };
        default:
          return current;
      }
    });
  });

  const { send: sendChatEvent } = useDataChannel('classroom-chat', (message) => {
    const payload = decodeData(message.payload);
    if (!payload?.text) return;
    setChatMessages((current) => [
      ...current.slice(-49),
      {
        id: payload.id,
        name: payload.name,
        text: payload.text,
        time: payload.time,
      },
    ]);
  });

  const { send: sendReactionEvent } = useDataChannel('classroom-reaction', (message) => {
    const payload = decodeData(message.payload);
    if (!payload?.emoji) return;
    const id = payload.id || `${Date.now()}-${Math.random()}`;
    setReactionBursts((current) => [...current, { id, emoji: payload.emoji, name: payload.name || 'Student' }].slice(-5));
    window.setTimeout(() => {
      setReactionBursts((current) => current.filter((entry) => entry.id !== id));
    }, 3500);
  });

  const allTracks = useMemo(
    () =>
      [...shareTracks, ...cameraTracks].filter(
        (trackRef, index, arr) => index === arr.findIndex((candidate) => trackIdentity(candidate) === trackIdentity(trackRef)),
      ),
    [cameraTracks, shareTracks],
  );
  const teacherIdentity = classSession?.teacher_id ? `teacher:${classSession.teacher_id}:class:${sessionId}` : '';

  const sidebarTracks = useMemo(
    () =>
      [...allTracks].sort((a, b) => {
        if (a.participant?.isLocal !== b.participant?.isLocal) {
          return Number(b.participant?.isLocal) - Number(a.participant?.isLocal);
        }
        return String(a.participant?.identity || '').localeCompare(String(b.participant?.identity || ''));
      }),
    [allTracks],
  );

  const isParticipantVisibleToAudience = (participant) => {
    if (!privateParticipantsEnabled || canManageParticipants) return true;
    const identity = String(participant?.identity || '');
    const participantUserId = extractUserIdFromIdentity(identity);
    return (
      participant?.isLocal ||
      identity === teacherIdentity ||
      identity.startsWith('admin:') ||
      cohostUserIds.includes(participantUserId)
    );
  };

  const visibleAllTracks = useMemo(
    () => allTracks.filter((trackRef) => isParticipantVisibleToAudience(trackRef.participant)),
    [allTracks, privateParticipantsEnabled, canManageParticipants, teacherIdentity, cohostUserIds],
  );
  const visibleSidebarTracks = useMemo(
    () => sidebarTracks.filter((trackRef) => isParticipantVisibleToAudience(trackRef.participant)),
    [sidebarTracks, privateParticipantsEnabled, canManageParticipants, teacherIdentity, cohostUserIds],
  );

  useEffect(() => {
    const userIds = Array.from(
      new Set([
        ...sidebarTracks.map((trackRef) => extractUserIdFromIdentity(trackRef.participant?.identity)).filter(Boolean),
        ...waitingUserIds,
        ...cohostUserIds,
      ]),
    );

    if (!userIds.length) return;

    let active = true;
    const loadProfiles = async () => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, avatar_url').in('id', userIds);
      if (!active || error || !data) return;
      const nextMap = data.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
      }, {});
      setProfilesByUserId((prev) => ({ ...prev, ...nextMap }));
    };

    loadProfiles();
    return () => {
      active = false;
    };
  }, [sidebarTracks, waitingUserIds, cohostUserIds]);

  const automaticFeaturedTrack = useMemo(() => {
    const teacherTrack = visibleAllTracks.find((trackRef) => trackRef.participant?.identity === teacherIdentity);
    if (teacherTrack) return teacherTrack;

    const remoteShare = visibleAllTracks.find((trackRef) => trackRef.source === Track.Source.ScreenShare && !trackRef.participant?.isLocal);
    if (remoteShare) return remoteShare;

    const remoteCamera = visibleAllTracks.find((trackRef) => trackRef.source === Track.Source.Camera && !trackRef.participant?.isLocal && !trackRef.publication?.isMuted);
    if (remoteCamera) return remoteCamera;

    const localShare = visibleAllTracks.find((trackRef) => trackRef.source === Track.Source.ScreenShare && trackRef.participant?.isLocal);
    if (localShare) return localShare;

    return visibleAllTracks[0] || null;
  }, [visibleAllTracks, cameraTracks, shareTracks, teacherIdentity]);

  const featuredTrack = useMemo(() => {
    const pinnedTrack = visibleAllTracks.find((trackRef) => collabState.pinnedParticipantIds.includes(trackRef.participant?.identity));
    if (pinnedTrack) return pinnedTrack;
    const spotlighted = visibleAllTracks.find((trackRef) => trackRef.participant?.identity === spotlightIdentity);
    return spotlighted || automaticFeaturedTrack;
  }, [visibleAllTracks, automaticFeaturedTrack, spotlightIdentity, collabState.pinnedParticipantIds]);

  const audienceCount = useMemo(() => {
    const participantIds = new Set(visibleSidebarTracks.map((trackRef) => trackRef.participant?.identity).filter(Boolean));
    return participantIds.size || 1;
  }, [visibleSidebarTracks]);

  const getDisplayData = (participant) => {
    const userId = extractUserIdFromIdentity(participant?.identity);
    const profile = profilesByUserId[userId] || (currentUserProfile?.id === userId ? currentUserProfile : null);
    return {
      displayName:
        profile?.full_name ||
        profile?.email ||
        participant?.name ||
        participant?.identity?.split(':')[0] ||
        'Participant',
      avatarUrl: profile?.avatar_url || '',
      userId,
    };
  };

  const { displayName: featuredName, avatarUrl: featuredAvatar } = getDisplayData(featuredTrack?.participant);
  const { displayName: localName } = getDisplayData(localParticipant);
  const attendanceStats = useMemo(() => {
    const now = Date.now();
    const uniqueUsers = new Set(attendanceEntries.map((entry) => entry.student_id).filter(Boolean));
    const liveNowCount = attendanceEntries.filter((entry) => entry.join_time && !entry.leave_time).length;
    const averageMinutes = attendanceEntries.length
      ? Math.round(
          attendanceEntries.reduce((sum, entry) => {
            const baseMinutes = Number(entry.live_minutes || 0);
            if (entry.join_time && !entry.leave_time) {
              return sum + Math.max(baseMinutes, Math.round((now - new Date(entry.join_time).getTime()) / 60000));
            }
            return sum + baseMinutes;
          }, 0) / attendanceEntries.length,
        )
      : 0;
    return {
      joinedCount: uniqueUsers.size,
      liveNowCount,
      averageMinutes,
    };
  }, [attendanceEntries]);
  const persistStatPatch = async (patchOrUpdater) => {
    if (!sessionId || !currentUserProfile?.id) return;
    const currentEntry =
      participantStats.find((entry) => entry.user_id === currentUserProfile.id) ||
      {
        session_id: sessionId,
        user_id: currentUserProfile.id,
        joined_at: joinTimestampRef.current || new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        left_at: null,
        speaking_seconds: 0,
        screen_share_seconds: 0,
        hand_raise_count: 0,
        chat_messages_count: 0,
        private_messages_count: 0,
        reactions_count: 0,
        focus_loss_count: 0,
        updated_at: new Date().toISOString(),
      };
    const nextEntry =
      typeof patchOrUpdater === 'function'
        ? patchOrUpdater(currentEntry)
        : { ...currentEntry, ...patchOrUpdater };
    nextEntry.session_id = sessionId;
    nextEntry.user_id = currentUserProfile.id;
    nextEntry.updated_at = new Date().toISOString();
    setParticipantStats((current) => {
      const others = current.filter((entry) => entry.user_id !== currentUserProfile.id);
      return [...others, nextEntry];
    });
    await supabase.from('class_session_live_participant_stats').upsert(nextEntry, {
      onConflict: 'session_id,user_id',
    });
  };

  const logActivityEvent = async (eventType, payload = {}) => {
    if (!sessionId || !currentUserProfile?.id) return;
    await supabase.from('class_session_live_activity_events').insert({
      session_id: sessionId,
      user_id: currentUserProfile.id,
      event_type: eventType,
      payload,
    });
  };

  useEffect(() => {
    if (speakingLocked && isMicrophoneEnabled) {
      localParticipant.setMicrophoneEnabled(false).catch(() => {});
    }
  }, [speakingLocked, isMicrophoneEnabled, localParticipant]);

  useEffect(() => {
    if (videoRestricted && isCameraEnabled) {
      localParticipant.setCameraEnabled(false).catch(() => {});
    }
  }, [videoRestricted, isCameraEnabled, localParticipant]);

  useEffect(() => {
    const expiredLivePoll = polls.find(
      (poll) => poll.status === 'live' && poll.ends_at && new Date(poll.ends_at).getTime() <= Date.now(),
    );
    if (!expiredLivePoll || !canManageParticipants) return undefined;

    const timeout = window.setTimeout(() => {
      handleClosePoll(expiredLivePoll.id);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [polls, canManageParticipants]);

  useEffect(() => {
    if (!sessionId || !currentUserProfile?.id) return undefined;

    let active = true;

    const loadAndCheck = async () => {
      if (!active) return;
      await loadEngagement();
    };

    loadAndCheck();

    const channel = supabase
      .channel(`class-live-engagement-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_session_live_polls', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_session_live_poll_votes', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_session_live_questions', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_session_live_question_votes', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_attendance', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_session_live_participant_stats', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_session_recordings', filter: `session_id=eq.${sessionId}` }, loadEngagement)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [sessionId, currentUserProfile?.id, loadEngagement]);

  useEffect(() => {
    if (!sessionId || !currentUserProfile?.id) return undefined;

    const joinAt = new Date().toISOString();
    joinTimestampRef.current = joinAt;

    const upsertAttendance = async () => {
      if (currentRole !== 'student') return;
      const payload = {
        session_id: sessionId,
        student_id: currentUserProfile.id,
        teacher_id: classSession?.teacher_id || null,
        attended: true,
        marked_at: joinAt,
        join_time: joinAt,
        leave_time: null,
        live_minutes: 0,
        attendance_source: classSession?.meeting_type === 'jitsi' ? 'jitsi' : classSession?.meeting_type === 'external' ? 'external' : 'livekit',
      };

      const { data: existing } = await supabase
        .from('class_attendance')
        .select('id, join_time')
        .eq('session_id', sessionId)
        .eq('student_id', currentUserProfile.id)
        .maybeSingle();

      if (existing?.id) {
        await supabase
          .from('class_attendance')
          .update({
            teacher_id: payload.teacher_id,
            attended: true,
            marked_at: joinAt,
            join_time: existing.join_time || joinAt,
            leave_time: null,
            attendance_source: payload.attendance_source,
          })
          .eq('id', existing.id);
        return;
      }

      await supabase.from('class_attendance').insert(payload);
    };

    upsertAttendance().catch(() => {});
    logActivityEvent('join', { role: currentRole }).catch(() => {});
    persistStatPatch({
      joined_at: joinAt,
      last_seen_at: joinAt,
      left_at: null,
    }).catch(() => {});

    return () => {
      const startedAt = joinTimestampRef.current || joinAt;
      const leaveAt = new Date().toISOString();
      const minutes = Math.max(1, Math.round((new Date(leaveAt).getTime() - new Date(startedAt).getTime()) / 60000));
      if (currentRole === 'student') {
        supabase
          .from('class_attendance')
          .update({
            leave_time: leaveAt,
            live_minutes: minutes,
            marked_at: leaveAt,
          })
          .eq('session_id', sessionId)
          .eq('student_id', currentUserProfile.id)
          .then(() => {})
          .catch(() => {});
      }
      logActivityEvent('leave', { role: currentRole }).catch(() => {});
      persistStatPatch((current) => ({
        ...current,
        left_at: leaveAt,
        last_seen_at: leaveAt,
      })).catch(() => {});
    };
  }, [sessionId, currentUserProfile?.id, classSession?.teacher_id, classSession?.meeting_type, currentRole]);

  useEffect(() => {
    if (!currentUserProfile?.id) return undefined;

    const markFocusLoss = (reason) => {
      if (focusLostRef.current) return;
      focusLostRef.current = true;
      logActivityEvent('focus_lost', { reason }).catch(() => {});
      persistStatPatch((current) => ({
        ...current,
        focus_loss_count: Number(current.focus_loss_count || 0) + 1,
        last_seen_at: new Date().toISOString(),
      })).catch(() => {});
    };

    const restoreFocus = (reason) => {
      if (!focusLostRef.current) return;
      focusLostRef.current = false;
      logActivityEvent('focus_restored', { reason }).catch(() => {});
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markFocusLoss('visibility_hidden');
      } else {
        restoreFocus('visibility_visible');
      }
    };

    const handleWindowBlur = () => markFocusLoss('window_blur');
    const handleWindowFocus = () => restoreFocus('window_focus');

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [currentUserProfile?.id]);

  useEffect(() => {
    if (!currentUserProfile?.id) return undefined;

    const interval = window.setInterval(() => {
      const now = Date.now();
      const speakingNow = Boolean(localParticipant?.isSpeaking);
      const sharingNow = Boolean(localParticipant?.isScreenShareEnabled);

      if (speakingNow && !speakingStateRef.current.active) {
        speakingStateRef.current = { active: true, startedAt: now };
        logActivityEvent('speaking_start').catch(() => {});
      } else if (!speakingNow && speakingStateRef.current.active) {
        const seconds = Math.max(1, Math.round((now - speakingStateRef.current.startedAt) / 1000));
        speakingStateRef.current = { active: false, startedAt: 0 };
        logActivityEvent('speaking_stop', { seconds }).catch(() => {});
        persistStatPatch((current) => ({
          ...current,
          speaking_seconds: Number(current.speaking_seconds || 0) + seconds,
          last_seen_at: new Date().toISOString(),
        })).catch(() => {});
      }

      if (sharingNow && !screenShareStateRef.current.active) {
        screenShareStateRef.current = { active: true, startedAt: now };
        logActivityEvent('screen_share_start').catch(() => {});
      } else if (!sharingNow && screenShareStateRef.current.active) {
        const seconds = Math.max(1, Math.round((now - screenShareStateRef.current.startedAt) / 1000));
        screenShareStateRef.current = { active: false, startedAt: 0 };
        logActivityEvent('screen_share_stop', { seconds }).catch(() => {});
        persistStatPatch((current) => ({
          ...current,
          screen_share_seconds: Number(current.screen_share_seconds || 0) + seconds,
          last_seen_at: new Date().toISOString(),
        })).catch(() => {});
      }
    }, 1500);

    return () => {
      window.clearInterval(interval);
      const now = Date.now();
      if (speakingStateRef.current.active) {
        const seconds = Math.max(1, Math.round((now - speakingStateRef.current.startedAt) / 1000));
        persistStatPatch((current) => ({
          ...current,
          speaking_seconds: Number(current.speaking_seconds || 0) + seconds,
        })).catch(() => {});
        speakingStateRef.current = { active: false, startedAt: 0 };
      }
      if (screenShareStateRef.current.active) {
        const seconds = Math.max(1, Math.round((now - screenShareStateRef.current.startedAt) / 1000));
        persistStatPatch((current) => ({
          ...current,
          screen_share_seconds: Number(current.screen_share_seconds || 0) + seconds,
        })).catch(() => {});
        screenShareStateRef.current = { active: false, startedAt: 0 };
      }
    };
  }, [currentUserProfile?.id, localParticipant]);

  useEffect(() => {
    if (!speakingLocked && !videoRestricted) return;
    const messages = [];
    if (speakingLocked) messages.push(canManageParticipants ? 'microphone disabled' : 'microphone disabled by teacher controls');
    if (videoRestricted) messages.push('camera disabled by admin');
    onToast?.(`Your ${messages.join(' and ')}.`);
  }, [speakingLocked, videoRestricted, onToast, canManageParticipants]);

  useEffect(() => {
    if (!breakout?.active || !breakout?.broadcast_message) return;
    onToast?.(`Breakout broadcast: ${breakout.broadcast_message}`);
  }, [breakout?.broadcast_at]);

  const handleAction = async (action, target = {}) => {
    if (!canManageParticipants) return;
    try {
      await controlLiveKitClassSession({
        sessionId,
        requesterId: currentUserProfile?.id,
        action,
        targetIdentity: target.targetIdentity || '',
        targetUserId: target.targetUserId || '',
        payload: target.payload || {},
      });
      const actionMessages = {
        set_spotlight: 'Participant is spotlighted for everyone.',
        clear_spotlight: 'Teacher is now the default spotlight.',
        kick_participant: 'Student was removed from the class.',
        ban_participant: 'Student was banned and removed from the class.',
        mute_participant: 'Student microphone was disabled by admin.',
        unmute_participant: 'Student microphone permission was enabled by admin.',
        mute_all_students: 'All student microphones were disabled.',
        disable_camera_participant: 'Student camera was disabled by admin.',
        enable_camera_participant: 'Student camera permission was enabled by admin.',
        disable_all_student_cameras: 'All student cameras were disabled.',
        lock_room: 'Room locked. New student joins are blocked.',
        unlock_room: 'Room unlocked. Students can join again.',
        toggle_waiting_room: 'Waiting room setting updated.',
        admit_participant: 'Student admitted from the waiting room.',
        toggle_private_participants: 'Participant visibility setting updated.',
        grant_cohost: 'Co-host permission granted.',
        revoke_cohost: 'Co-host permission removed.',
        lower_hand: 'Raised hand lowered.',
        set_queue: 'Raised-hand queue updated live.',
        set_allowed_speakers: 'Speaker permissions updated live.',
        start_breakouts_auto: 'Breakout rooms started.',
        assign_breakout_room: 'Student moved to breakout room.',
        set_teacher_breakout_room: 'Teacher breakout room changed.',
        broadcast_breakout_message: 'Broadcast sent to breakout rooms.',
        close_breakouts: 'Everyone was pulled back to the main room.',
      };
      onToast?.(actionMessages[action] || 'Moderator action applied.');
    } catch (error) {
      onToast?.(error.message || 'Could not apply moderator action.');
    }
  };

  const broadcastCollabEvent = async (payload) => {
    await sendCollabEvent(encodeData(payload), { reliable: true });
  };

  const handleRaiseHandToggle = async () => {
    const raised = collabState.raisedHands.includes(userId);
    setCollabState((current) => ({
      ...current,
      raisedHands: raised
        ? current.raisedHands.filter((entry) => entry !== userId)
        : current.raisedHands.includes(userId)
          ? current.raisedHands
          : [...current.raisedHands, userId],
    }));
    try {
      await controlLiveKitClassSession({
        sessionId,
        requesterId: currentUserProfile?.id,
        action: raised ? 'lower_hand' : 'raise_hand',
        targetUserId: userId,
      });
      await broadcastCollabEvent({
        type: raised ? 'lower_hand' : 'raise_hand',
        userId,
      });
      await logActivityEvent(raised ? 'lower_hand' : 'raise_hand');
      if (!raised) {
        await persistStatPatch((current) => ({
          ...current,
          hand_raise_count: Number(current.hand_raise_count || 0) + 1,
        }));
      }
    } catch (error) {
      onToast?.(error.message || 'Could not update raised hand.');
    }
  };

  const handleQueueUpdate = async (nextQueue) => {
    if (canManageParticipants) {
      await handleAction('set_queue', { payload: { queue: nextQueue } });
    }
    await broadcastCollabEvent({
      type: 'set_queue',
      queue: nextQueue,
    });
  };

  const handleLowerHandForUser = async (targetUserId) => {
    if (!canManageParticipants || !targetUserId) return;
    await handleAction('lower_hand', { targetUserId });
    await broadcastCollabEvent({
      type: 'lower_hand',
      userId: targetUserId,
    });
  };

  const handleAllowSpeaker = async (targetUserId) => {
    const nextAllowed = collabState.allowedSpeakerUserIds.includes(targetUserId)
      ? collabState.allowedSpeakerUserIds.filter((entry) => entry !== targetUserId)
      : [...collabState.allowedSpeakerUserIds, targetUserId];
    if (canManageParticipants) {
      await handleAction('set_allowed_speakers', { payload: { allowedSpeakerUserIds: nextAllowed } });
    }
    await broadcastCollabEvent({
      type: 'set_allowed_speakers',
      allowedSpeakerUserIds: nextAllowed,
    });
  };

  const handlePinToggle = async (identity) => {
    await broadcastCollabEvent({ type: 'toggle_pin', identity });
  };

  const handleViewModeChange = async (viewMode) => {
    if (!canManageParticipants) return;
    await broadcastCollabEvent({ type: 'set_view_mode', viewMode });
  };

  const handleSendChat = async () => {
    const text = chatDraft.trim();
    if (!text) return;
    const payload = {
      id: `${Date.now()}-${Math.random()}`,
      name: currentUserProfile?.full_name || 'Participant',
      identity: localParticipant?.identity || '',
      text,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
    await sendChatEvent(encodeData(payload), { reliable: true });
    setChatMessages((current) => [...current.slice(-49), payload]);
    await logActivityEvent('chat_message');
    await persistStatPatch((current) => ({
      ...current,
      chat_messages_count: Number(current.chat_messages_count || 0) + 1,
    }));
    setChatDraft('');
  };

  const handleReaction = async (emoji) => {
    const id = `${Date.now()}-${Math.random()}`;
    setReactionBursts((current) => [...current, { id, emoji, name: currentUserProfile?.full_name || 'Participant' }].slice(-5));
    window.setTimeout(() => {
      setReactionBursts((current) => current.filter((entry) => entry.id !== id));
    }, 3500);
    await sendReactionEvent(
      encodeData({
        id,
        emoji,
        name: currentUserProfile?.full_name || 'Participant',
      }),
      { reliable: false },
    );
    await logActivityEvent('reaction', { emoji });
    await persistStatPatch((current) => ({
      ...current,
      reactions_count: Number(current.reactions_count || 0) + 1,
    }));
  };

  const handleStartBreakoutsAuto = async (roomCount) => {
    await handleAction('start_breakouts_auto', { payload: { roomCount } });
  };

  const handleJumpToBreakout = async (roomId) => {
    await handleAction('set_teacher_breakout_room', { payload: { roomId } });
  };

  const handleBroadcastBreakout = async (message) => {
    if (!message?.trim()) return;
    await handleAction('broadcast_breakout_message', { payload: { message } });
  };

  const handleCloseBreakouts = async () => {
    await handleAction('close_breakouts');
  };

  const handleAssignBreakout = async (targetUserId, roomId) => {
    await handleAction('assign_breakout_room', { targetUserId, payload: { roomId } });
  };

  const handleCreatePoll = async () => {
    const question = pollComposer.question.trim();
    const options = pollComposer.optionsText
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!question || options.length < 2) {
      onToast?.('Add a poll question and at least two options.');
      return;
    }
    if (pollComposer.type === 'quiz' && pollComposer.correctOptionIndex === '') {
      onToast?.('Choose the correct answer for the quiz.');
      return;
    }

    const durationMinutes = Math.max(0, Number(pollComposer.durationMinutes || 0));
    const endsAt = durationMinutes ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null;

    const { error } = await supabase.from('class_session_live_polls').insert({
      session_id: sessionId,
      created_by: currentUserProfile.id,
      question,
      options,
      allow_multiple: pollComposer.type === 'quiz' ? false : pollComposer.allowMultiple,
      status: 'live',
      started_at: new Date().toISOString(),
      ends_at: endsAt,
      correct_option_index: pollComposer.type === 'quiz' ? Number(pollComposer.correctOptionIndex) : null,
    });

    if (error) {
      onToast?.(error.message || 'Could not create poll.');
      return;
    }

    setPollComposer({
      type: 'poll',
      question: '',
      optionsText: 'Yes\nNo',
      allowMultiple: false,
      durationMinutes: '',
      correctOptionIndex: '',
    });
    onToast?.(pollComposer.type === 'quiz' ? 'Timed quiz launched.' : 'Live poll launched.');
  };

  const handleVotePoll = async (poll, optionIndex) => {
    if (!poll?.id || poll.status !== 'live' || !currentUserProfile?.id) return;

    const existingVotes = pollVotes.filter((vote) => vote.poll_id === poll.id && vote.user_id === currentUserProfile.id);
    const hasVote = existingVotes.some((vote) => Number(vote.option_index) === optionIndex);

    if (hasVote) {
      const voteToDelete = existingVotes.find((vote) => Number(vote.option_index) === optionIndex);
      if (voteToDelete?.id) {
        setPollVotes((current) => current.filter((vote) => vote.id !== voteToDelete.id));
        const { error } = await supabase.from('class_session_live_poll_votes').delete().eq('id', voteToDelete.id);
        if (error) {
          onToast?.(error.message || 'Could not update vote.');
          setPollVotes((current) => [...current, voteToDelete]);
        }
      }
      return;
    }

    if (!poll.allow_multiple && existingVotes.length) {
      const existingIds = existingVotes.map((vote) => vote.id).filter(Boolean);
      if (existingIds.length) {
        setPollVotes((current) => current.filter((vote) => !existingIds.includes(vote.id)));
        await supabase.from('class_session_live_poll_votes').delete().in('id', existingIds);
      }
    }

    const optimisticVote = {
      id: `temp-${Date.now()}-${Math.random()}`,
      poll_id: poll.id,
      session_id: sessionId,
      user_id: currentUserProfile.id,
      option_index: optionIndex,
    };
    setPollVotes((current) => [...current, optimisticVote]);
    const { error } = await supabase.from('class_session_live_poll_votes').insert({
      poll_id: poll.id,
      session_id: sessionId,
      user_id: currentUserProfile.id,
      option_index: optionIndex,
    });

    if (error) {
      onToast?.(error.message || 'Could not save vote.');
      setPollVotes((current) => current.filter((vote) => vote.id !== optimisticVote.id));
    }
  };

  const handleClosePoll = async (pollId) => {
    const closedAt = new Date().toISOString();
    setPolls((current) =>
      current.map((poll) =>
        poll.id === pollId
          ? {
              ...poll,
              status: 'closed',
              closed_at: closedAt,
              updated_at: closedAt,
            }
          : poll,
      ),
    );
    const { error } = await supabase
      .from('class_session_live_polls')
      .update({
        status: 'closed',
        closed_at: closedAt,
        updated_at: closedAt,
      })
      .eq('id', pollId);
    if (error) {
      onToast?.(error.message || 'Could not close poll.');
      loadEngagement();
      return;
    }
    onToast?.('Poll closed.');
  };

  const handleAskQuestion = async () => {
    const question = qaDraft.trim();
    if (!question) return;
    const { error } = await supabase.from('class_session_live_questions').insert({
      session_id: sessionId,
      user_id: currentUserProfile.id,
      question,
    });
    if (error) {
      onToast?.(error.message || 'Could not send question.');
      return;
    }
    setQaDraft('');
  };

  const handleToggleQuestionUpvote = async (question) => {
    const existing = questionVotes.find((vote) => vote.question_id === question.id && vote.user_id === currentUserProfile.id);
    if (existing?.id) {
      const { error } = await supabase.from('class_session_live_question_votes').delete().eq('id', existing.id);
      if (error) onToast?.(error.message || 'Could not remove upvote.');
      return;
    }

    const { error } = await supabase.from('class_session_live_question_votes').insert({
      question_id: question.id,
      session_id: sessionId,
      user_id: currentUserProfile.id,
    });
    if (error) onToast?.(error.message || 'Could not add upvote.');
  };

  const handlePinQuestion = async (question) => {
    const { error } = await supabase
      .from('class_session_live_questions')
      .update({
        is_pinned: !question.is_pinned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', question.id);
    if (error) onToast?.(error.message || 'Could not update question.');
  };

  const handleAnswerQuestion = async (question) => {
    const nextAnswer = window.prompt('Enter the teacher answer for this question.', question.answer_text || '');
    if (nextAnswer === null) return;
    const answer = nextAnswer.trim();
    const { error } = await supabase
      .from('class_session_live_questions')
      .update({
        answer_text: answer,
        answered_by: currentUserProfile.id,
        answered_at: answer ? new Date().toISOString() : null,
        status: answer ? 'answered' : 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('id', question.id);
    if (error) onToast?.(error.message || 'Could not save answer.');
  };

  const handleDismissQuestion = async (question) => {
    const nextStatus = question.status === 'dismissed' ? 'open' : 'dismissed';
    const { error } = await supabase
      .from('class_session_live_questions')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', question.id);
    if (error) onToast?.(error.message || 'Could not update question state.');
  };

  const handleToggleRecording = async () => {
    if (!canManageParticipants) return;
    const activeRecordings = recordings.filter((entry) => entry.status === 'recording');
    const activeRecording = activeRecordings[0];

    if (activeRecording) {
      const stoppedAt = new Date().toISOString();
      setRecordings((current) =>
        current.map((entry) =>
          entry.status === 'recording'
            ? { ...entry, status: 'completed', stopped_at: stoppedAt, stopped_by: currentUserProfile.id, updated_at: stoppedAt }
            : entry,
        ),
      );
      const { error } = await supabase
        .from('class_session_recordings')
        .update({
          status: 'completed',
          stopped_at: stoppedAt,
          stopped_by: currentUserProfile.id,
          updated_at: stoppedAt,
        })
        .eq('session_id', sessionId)
        .eq('status', 'recording');
      if (error) {
        onToast?.(error.message || 'Could not stop recording log.');
        loadEngagement();
        return;
      }
      await logActivityEvent('recording_stopped');
      onToast?.('Recording log stopped.');
      return;
    }

    const startedAt = new Date().toISOString();
    const { error } = await supabase.from('class_session_recordings').insert({
      session_id: sessionId,
      started_by: currentUserProfile.id,
      status: 'recording',
      recording_mode: 'session-log',
      started_at: startedAt,
      updated_at: startedAt,
    });
    if (error) {
      onToast?.(error.message || 'Could not start recording log.');
      return;
    }
    await logActivityEvent('recording_started');
    onToast?.('Recording log started.');
  };

  const railTabs = [
    { id: 'people', label: 'People', count: audienceCount },
    { id: 'engage', label: 'Engage', count: collabState.raisedHands.length + polls.length + questions.length + chatMessages.length },
    { id: 'tools', label: 'Tools', count: recordings.length + (breakout?.active ? 1 : 0) },
  ];

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(145deg,_#020617,_#0f172a_52%,_#111827)] text-white">
      <ReactionBurst reactions={reactionBursts} />
      <ParticipantsPopup
        open={participantsPopupOpen}
        onClose={() => setParticipantsPopupOpen(false)}
        participants={sidebarTracks}
        profilesByUserId={profilesByUserId}
        spotlightIdentity={spotlightIdentity}
        roomLocked={roomLocked}
        restrictedAudioUserIds={restrictedAudioUserIds}
        restrictedVideoUserIds={restrictedVideoUserIds}
        waitingRoomEnabled={waitingRoomEnabled}
        privateParticipantsEnabled={privateParticipantsEnabled}
        waitingUserIds={waitingUserIds}
        cohostUserIds={cohostUserIds}
        teacherIdentity={teacherIdentity}
        breakoutRooms={Array.isArray(breakout?.rooms) ? breakout.rooms : []}
        raisedHands={collabState.raisedHands}
        speakerQueue={collabState.speakerQueue}
        allowedSpeakerUserIds={collabState.allowedSpeakerUserIds}
        pinnedParticipantIds={collabState.pinnedParticipantIds}
        canManageParticipants={canManageParticipants}
        canManageCoHosts={canManageCoHosts}
        onQueueUpdate={handleQueueUpdate}
        onAllowSpeaker={handleAllowSpeaker}
        onPinToggle={handlePinToggle}
        onAssignBreakout={handleAssignBreakout}
        onAction={handleAction}
      />

      <div className="flex flex-1 flex-col gap-4 p-3 pb-24 sm:p-4 sm:pb-28 lg:min-h-0 lg:flex-row lg:gap-4 lg:p-4 lg:pb-28">
        <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/72 shadow-[0_24px_80px_rgba(2,8,23,0.42)] lg:min-h-0">
          <div className="absolute inset-0 bg-slate-900/20" />
          <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">Main Stage</p>
              <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">{featuredName}</h2>
              <p className="mt-1 text-sm text-slate-300">
                {spotlightIdentity ? 'Spotlight synced for everyone' : 'Teacher is the default spotlight'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canManageParticipants ? (
                <>
                  <ControlButton icon={LayoutGrid} label="Grid View" onClick={() => handleViewModeChange('grid')} />
                  <ControlButton icon={Users} label="Speaker View" onClick={() => handleViewModeChange('speaker')} />
                </>
              ) : null}
              <button
                type="button"
                onClick={handleRaiseHandToggle}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                  collabState.raisedHands.includes(userId)
                    ? 'bg-amber-400 text-slate-950'
                    : 'border border-emerald-300/30 bg-emerald-400/10 text-emerald-100'
                }`}
              >
                <Hand size={16} />
                <span>{collabState.raisedHands.includes(userId) ? 'Lower Hand' : 'Raise Hand'}</span>
              </button>
              <div className="flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 animate-pulse" />
                <span>{roomLocked ? 'Live | Room Locked' : 'Class live'}</span>
              </div>
            </div>
          </div>

          <div className="h-full p-3 pt-28 sm:p-4 sm:pt-28">
            {collabState.teacherViewMode === 'grid' ? (
              <div className="grid h-full min-h-[260px] grid-cols-1 gap-3 overflow-auto rounded-2xl border border-white/10 bg-slate-900/45 p-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleAllTracks.map((trackRef) => {
                  const { displayName, avatarUrl } = getDisplayData(trackRef.participant);
                  return (
                    <div key={trackIdentity(trackRef)} className="min-h-[180px] overflow-hidden rounded-xl border border-white/10 bg-slate-900/70">
                      <VideoSurface trackRef={trackRef} displayName={displayName} avatarUrl={avatarUrl} />
                    </div>
                  );
                })}
              </div>
            ) : featuredTrack ? (
              <div className="h-full min-h-[260px] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
                <VideoSurface trackRef={featuredTrack} displayName={featuredName} avatarUrl={featuredAvatar} large />
              </div>
            ) : (
              <div className="flex h-full min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-900/40 text-center">
                <div>
                  <Video className="mx-auto mb-4 text-amber-200" size={44} />
                  <p className="text-lg font-semibold text-white">Waiting for camera streams</p>
                  <p className="mt-2 text-sm text-slate-400">Participants will appear here as soon as they join the room.</p>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <SessionBadge icon={Users} label="Participants" value={`${audienceCount} in room`} accent="text-sky-200" />
              <SessionBadge icon={Volume2} label="Your Seat" value={localName} accent="text-emerald-200" />
              <SessionBadge
                icon={spotlightIdentity ? Users : Video}
                label="Spotlight"
                value={spotlightIdentity ? 'Manual sync active' : 'Teacher default'}
                accent="text-amber-200"
              />
            </div>
          </div>
        </div>

        <aside ref={participantRailRef} className="flex h-[58vh] min-h-[360px] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/78 shadow-[0_22px_70px_rgba(2,8,23,0.38)] lg:h-auto lg:min-h-0 lg:min-w-[400px] lg:max-w-[480px] lg:flex-[0_0_30rem]">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Classroom Rail</p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Participants and tools</h3>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-slate-200">
                  {audienceCount} visible
                </span>
                <ScrollButtons targetRef={participantRailRef} />
                {canManageParticipants ? (
                  <button
                    type="button"
                    onClick={() => setParticipantsPopupOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
                  >
                    <Users size={14} />
                    <span>Participants</span>
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
              {railTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRailTab(tab.id)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
                    railTab === tab.id
                      ? 'bg-white text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${railTab === tab.id ? 'bg-slate-950/10' : 'bg-white/10'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
            <div className={railTab === 'engage' ? 'mt-3 space-y-3' : 'hidden'}>
            <div className="flex flex-wrap gap-2">
              {[
                { emoji: '👍', label: 'Like' },
                { emoji: '👏', label: 'Clap' },
                { emoji: '😂', label: 'Laugh' },
                { emoji: '✅', label: 'Yes' },
                { emoji: '❓', label: 'Question' },
              ].map((reaction) => (
                <button
                  key={reaction.label}
                  type="button"
                  onClick={() => handleReaction(reaction.emoji)}
                  className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/14"
                >
                  <span>{reaction.emoji}</span>
                  <span>{reaction.label}</span>
                </button>
              ))}
            </div>
            {canManageParticipants && collabState.raisedHands.length ? (
            <div className="mt-3">
              <RaisedHandsPanel
                raisedHands={collabState.raisedHands}
                profilesByUserId={profilesByUserId}
                onQueueUpdate={handleQueueUpdate}
                onLowerHand={handleLowerHandForUser}
                speakerQueue={collabState.speakerQueue}
                canManageParticipants={canManageParticipants}
              />
            </div>
            ) : null}
            </div>
            <div className={railTab === 'tools' ? 'mt-3 space-y-3' : 'hidden'}>
            <div>
              <BreakoutPanel
                breakout={breakout}
                profilesByUserId={profilesByUserId}
                canManageParticipants={canManageParticipants}
                onStartAuto={handleStartBreakoutsAuto}
                onCloseBreakouts={handleCloseBreakouts}
                onJumpToRoom={handleJumpToBreakout}
                onBroadcast={handleBroadcastBreakout}
              />
            </div>
            </div>
            <div className={railTab === 'people' ? 'mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3' : 'hidden'}>
              <div className="flex items-center gap-2">
                <BarChart3 size={15} className="text-sky-200" />
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Attendance Snapshot</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Joined</p>
                  <p className="mt-1 text-sm font-semibold text-white">{attendanceStats.joinedCount}</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live now</p>
                  <p className="mt-1 text-sm font-semibold text-white">{attendanceStats.liveNowCount}</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Avg stay</p>
                  <p className="mt-1 text-sm font-semibold text-white">{formatDurationMinutes(attendanceStats.averageMinutes)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 scroll-smooth">
            <div className={railTab === 'people' ? 'rounded-xl' : 'hidden'}>
            {visibleSidebarTracks.length ? (
                  visibleSidebarTracks.map((trackRef) => {
                    const { displayName, avatarUrl } = getDisplayData(trackRef.participant);
                    const railUserId = extractUserIdFromIdentity(trackRef.participant?.identity);
                    const roleLabel = getClassParticipantRoleLabel({
                      participant: trackRef.participant,
                      userId: railUserId,
                      teacherIdentity,
                      cohostUserIds,
                    });
                    const micOn = isMicEnabled(trackRef.participant);
                    const cameraPublication = getCameraPublication(trackRef.participant);
                    const roomLabel = getBreakoutRoomLabel(breakout, railUserId);

                    return (
                  <div key={trackIdentity(trackRef)} className="mb-3 overflow-hidden rounded-xl border border-white/10 bg-slate-900/72 shadow-[0_14px_34px_rgba(2,8,23,0.2)]">
                    <div className="relative h-36">
                      <VideoSurface trackRef={trackRef} displayName={displayName} avatarUrl={avatarUrl} />
                    </div>
                    <div className="space-y-3 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                          <p className="mt-1 text-xs text-slate-400">{roleLabel}</p>
                        </div>
                            <div className="flex flex-wrap justify-end gap-2">
                              {roleLabel === 'Host' ? (
                                <span className="rounded-full bg-emerald-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">Host</span>
                              ) : null}
                              {roleLabel === 'Co-host' ? (
                                <span className="rounded-full bg-cyan-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">Co-host</span>
                              ) : null}
                              {roomLabel ? (
                                <span className="rounded-full bg-sky-400/15 px-2.5 py-1 text-[11px] font-semibold text-sky-200">{roomLabel}</span>
                              ) : null}
                              {collabState.raisedHands.includes(extractUserIdFromIdentity(trackRef.participant?.identity)) ? (
                                <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">Hand Raised</span>
                              ) : null}
                          {trackRef.participant?.identity === spotlightIdentity ? (
                            <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-semibold text-slate-950">Live spotlight</span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handlePinToggle(trackRef.participant?.identity)}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              collabState.pinnedParticipantIds.includes(trackRef.participant?.identity) ? 'bg-fuchsia-400 text-slate-950' : 'bg-white/8 text-white'
                            }`}
                          >
                            Pin
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StatusPill
                          active={micOn}
                          activeLabel="Unmuted"
                          inactiveLabel="Muted"
                          activeClass="bg-emerald-400/15 text-emerald-200"
                          inactiveClass="bg-rose-400/15 text-rose-200"
                          icon={micOn ? Mic : MicOff}
                        />
                        <StatusPill
                          active={!cameraPublication?.isMuted}
                          activeLabel="Camera on"
                          inactiveLabel="Camera off"
                          activeClass="bg-sky-400/15 text-sky-200"
                          inactiveClass="bg-slate-700 text-slate-300"
                          icon={Video}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-center text-sm text-slate-400">
                No video tiles yet.
              </div>
            )}
            </div>
            <div className={railTab === 'tools' ? 'space-y-3' : 'hidden'}>
            <CollapsibleSection title="Recording" subtitle="Session recording state and recent log." badge={recordings.length ? `${recordings.length}` : 'Idle'} icon={VideoOff}>
              <RecordingPanel
                canManageParticipants={canManageParticipants}
                recordings={recordings}
                onToggleRecording={handleToggleRecording}
              />
            </CollapsibleSection>
            <CollapsibleSection title="Analytics" subtitle="Speaking, engagement, and focus signals." badge={`${participantStats.length}`} icon={BarChart3}>
              <AnalyticsPanel
                stats={participantStats}
                profilesByUserId={profilesByUserId}
                currentUserId={currentUserProfile?.id}
              />
            </CollapsibleSection>
            </div>
            <div className={railTab === 'engage' ? 'space-y-3' : 'hidden'}>
              <PollPanel
                canManageParticipants={canManageParticipants}
                polls={polls}
                pollVotes={pollVotes}
                currentUserId={currentUserProfile?.id}
                composer={pollComposer}
                onComposerChange={setPollComposer}
                onCreatePoll={handleCreatePoll}
                onVotePoll={handleVotePoll}
                onClosePoll={handleClosePoll}
              />
              <QAPanel
                canManageParticipants={canManageParticipants}
                questions={questions}
                questionVotes={questionVotes}
                profilesByUserId={profilesByUserId}
                currentUserId={currentUserProfile?.id}
                draft={qaDraft}
                onDraftChange={setQaDraft}
                onAsk={handleAskQuestion}
                onToggleUpvote={handleToggleQuestionUpvote}
                onPinQuestion={handlePinQuestion}
                onAnswerQuestion={handleAnswerQuestion}
                onDismissQuestion={handleDismissQuestion}
              />
              <ChatPanel
                messages={chatMessages}
                draft={chatDraft}
                onDraftChange={setChatDraft}
                onSend={handleSendChat}
                canSend
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

const LiveKitClassSession = ({ token, serverUrl, sessionId, currentRole, currentUserProfile, classSession, onLeave, onEndSession, onToast }) => {
  const containerRef = useRef(null);
  const controls = classSession?.livekit_controls || {};
  const restrictedAudioUserIds = Array.isArray(controls?.restricted_audio_user_ids) ? controls.restricted_audio_user_ids.map(String) : [];
  const restrictedVideoUserIds = Array.isArray(controls?.restricted_video_user_ids) ? controls.restricted_video_user_ids.map(String) : [];
  const audioRestricted = restrictedAudioUserIds.includes(currentUserProfile?.id);
  const videoRestricted = restrictedVideoUserIds.includes(currentUserProfile?.id);

  if (!token || !serverUrl) {
    return null;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        audio={currentRole !== 'student'}
        video={currentRole !== 'student'}
        className="h-full w-full"
        onDisconnected={onLeave}
      >
        <RoomAudioRenderer />
        <ClassroomLayout
          sessionId={sessionId}
          currentRole={currentRole}
          currentUserProfile={currentUserProfile}
          classSession={classSession}
          containerRef={containerRef}
          onToast={onToast}
        />
        <LiveKitControls
          onLeave={onLeave}
          onEndSession={onEndSession}
          canEndSession={currentRole === 'teacher' || currentRole === 'admin'}
          containerRef={containerRef}
          audioRestricted={audioRestricted}
          videoRestricted={videoRestricted}
        />
      </LiveKitRoom>
    </div>
  );
};

export default LiveKitClassSession;
