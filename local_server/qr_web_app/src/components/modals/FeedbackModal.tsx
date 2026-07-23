import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';

export const FeedbackModal: React.FC = () => {
  const { isFeedbackModalOpen, setIsFeedbackModalOpen, showToast } = useApp();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');

  if (!isFeedbackModalOpen) return null;

  const handleSubmit = () => {
    showToast('Thank you! Your feedback has been sent to management.');
    setIsFeedbackModalOpen(false);
    setComment('');
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#001712]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-md w-full rounded-2xl p-6 sm:p-8 border border-[#E3C282]/40 shadow-2xl">
        <button
          onClick={() => setIsFeedbackModalOpen(false)}
          className="absolute top-5 right-5 text-[#C1C8C4] hover:text-[#E3C282] p-2 rounded-full hover:bg-[#0F2D26] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#E3C282] uppercase block mb-1">
          GUEST EXPERIENCE
        </span>
        <h2 className="font-serif-display font-bold text-2xl text-[#C7EADE] mb-2">
          Leave Feedback
        </h2>
        <p className="font-sans-body text-xs text-[#C1C8C4] mb-6">
          Rate your dining experience at Table 12.
        </p>

        {/* Rating Stars */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className="p-1 transition-transform hover:scale-125"
            >
              <span
                className={`material-symbols-outlined text-3xl ${
                  star <= rating ? 'filled text-[#E3C282]' : 'text-[#C1C8C4]/40'
                }`}
              >
                star
              </span>
            </button>
          ))}
        </div>

        {/* Comment textarea */}
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write your comments regarding cuisine, atmosphere, or service..."
          className="w-full bg-[#00110D] border border-[#E3C282]/20 rounded-xl p-3.5 text-xs text-[#C7EADE] focus:outline-none focus:border-[#E3C282] mb-6 font-sans-body"
        />

        <button
          onClick={handleSubmit}
          className="w-full bg-[#E3C282] text-[#001712] font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#FFDEA0] transition-colors uppercase"
        >
          SUBMIT FEEDBACK
        </button>
      </div>
    </div>
  );
};
