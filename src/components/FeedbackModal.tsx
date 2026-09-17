import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Sparkles,
  Bug,
  MessageCircle,
  Star,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { feedbackService, FeedbackPayload } from '../services/feedbackService';
import { AlertBanner } from './AlertBanner';
import { ModalShell } from './ModalShell';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [category, setCategory] = useState<FeedbackPayload['category']>('general');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [message, setMessage] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false);
      setSuccessMessage('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const platform = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown OS';

    const payload: FeedbackPayload = {
      category,
      message: message.trim(),
      rating: rating > 0 ? rating : undefined,
      name: name.trim() || undefined,
      email: email.trim() || undefined,
      includeSystemInfo: true,
      systemInfo: {
        appVersion: '1.2.0',
        platform,
      },
    };

    const res = await feedbackService.sendFeedback(payload);

    setIsSubmitting(false);
    if (res.success) {
      setIsSuccess(true);
      setSuccessMessage(res.message);
      setMessage('');
      setRating(0);
    } else {
      setErrorMessage(res.message);
    }
  };

  const getPlaceholder = () => {
    switch (category) {
      case 'feature':
        return 'What feature or improvement would help you practice LLD better?';
      case 'bug':
        return 'What went wrong? Please describe the issue and steps to reproduce...';
      default:
        return 'What do you think of the app? Any thoughts, critiques, or ideas are welcome!';
    }
  };

  const getRatingLabel = (val: number) => {
    if (val === 0) return 'Optional';
    if (val <= 1.0) return 'Poor';
    if (val <= 2.0) return 'Fair';
    if (val <= 3.0) return 'Good';
    if (val <= 4.0) return 'Great';
    return 'Loved it!';
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={<h2 className="text-slate-900 dark:text-zinc-100 font-bold text-sm">Send Feedback</h2>}
      subtitle={
        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
          Direct message to the developer
        </p>
      }
      icon={
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400">
          <MessageSquare className="w-4 h-4" />
        </div>
      }
      maxWidth="max-w-lg"
      maxHeight="max-h-[90vh]"
      closeDisabled={isSubmitting}
    >
        {/* Body */}
        {isSuccess ? (
          <div className="p-8 text-center flex flex-col items-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 duration-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Thank you for your feedback!
              </h3>
              <p className="text-xs text-slate-600 dark:text-zinc-400 max-w-sm">
                {successMessage || 'Your message has been sent directly to the developer’s inbox. Your input helps make LLD Practice better.'}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
            
            {/* Overall Rating Card (Option 2 with half-star precision) */}
            <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800/80 bg-slate-50/50 dark:bg-zinc-900/40 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                  Overall Rating
                </div>
                <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                  How is your experience with LLD Practice?
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center gap-1"
                  onMouseLeave={() => setHoverRating(0)}
                >
                  {[1, 2, 3, 4, 5].map((starIndex) => {
                    const active = hoverRating || rating;
                    let fillPercent = 0;
                    if (active >= starIndex) {
                      fillPercent = 100;
                    } else if (active >= starIndex - 0.5) {
                      fillPercent = 50;
                    }

                    return (
                      <div key={starIndex} className="relative w-5 h-5 flex items-center justify-center">
                        {/* Background empty star */}
                        <Star className="w-5 h-5 text-slate-300 dark:text-zinc-600 transition-colors" />

                        {/* Foreground filled star with clip width */}
                        {fillPercent > 0 && (
                          <div
                            className="absolute top-0 left-0 h-full overflow-hidden pointer-events-none"
                            style={{ width: `${fillPercent}%` }}
                          >
                            <Star className="w-5 h-5 fill-amber-400 text-amber-400 shrink-0" />
                          </div>
                        )}

                        {/* Left half clickable (e.g. 0.5, 1.5, 2.5, 3.5, 4.5) */}
                        <button
                          type="button"
                          aria-label={`${starIndex - 0.5} stars`}
                          className="absolute left-0 top-0 w-1/2 h-full z-10 cursor-pointer"
                          onMouseEnter={() => setHoverRating(starIndex - 0.5)}
                          onClick={() => setRating(rating === starIndex - 0.5 ? 0 : starIndex - 0.5)}
                        />

                        {/* Right half clickable (e.g. 1.0, 2.0, 3.0, 4.0, 5.0) */}
                        <button
                          type="button"
                          aria-label={`${starIndex} stars`}
                          className="absolute right-0 top-0 w-1/2 h-full z-10 cursor-pointer"
                          onMouseEnter={() => setHoverRating(starIndex)}
                          onClick={() => setRating(rating === starIndex ? 0 : starIndex)}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="min-w-[75px] text-right">
                  <span className="text-xs font-semibold text-amber-500">
                    {getRatingLabel(hoverRating || rating)}
                  </span>
                  {(hoverRating || rating) > 0 && (
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 block font-mono">
                      {(hoverRating || rating).toFixed(1)} / 5
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Category selection */}
            <div className="space-y-1.5">
              <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                Category
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setCategory('feature')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    category === 'feature'
                      ? 'bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-300 font-semibold shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Feature</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('bug')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    category === 'bug'
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300 font-semibold shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <Bug className="w-3.5 h-3.5 text-rose-500" />
                  <span>Bug Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('general')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    category === 'general'
                      ? 'bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-300 font-semibold shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
                  <span>General</span>
                </button>
              </div>
            </div>

            {/* Feedback Message */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-slate-600 dark:text-zinc-400 text-[11px] font-medium">
                <span>Your Message <span className="text-rose-500">*</span></span>
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-mono">
                  {message.length} chars
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={getPlaceholder()}
                rows={4}
                required
                className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg p-3 outline-none focus:border-blue-500 placeholder-slate-400 dark:placeholder-zinc-500 transition-colors resize-none"
              />
            </div>

            {/* Sender Info (Optional) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                  Your Name <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-slate-600 dark:text-zinc-400 text-[11px] font-medium block">
                  Your Email <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-normal">(For replies)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 text-xs text-slate-900 dark:text-zinc-100 rounded-lg px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <AlertBanner variant="rose" className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </AlertBanner>
            )}

            {/* Footer */}
            <div className="pt-2 border-t border-slate-200 dark:border-zinc-800/80 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!message.trim() || isSubmitting}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </>
                )}
              </button>
            </div>

          </form>
        )}
    </ModalShell>
  );
};
