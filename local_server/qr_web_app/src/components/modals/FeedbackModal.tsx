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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0A1F44]/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative glass-card max-w-md w-full rounded-2xl p-6 sm:p-8 border border-[#0077CC]/40 shadow-2xl">
        <button
          onClick={() => setIsFeedbackModalOpen(false)}
          className="absolute top-5 right-5 text-[#9FB0C4] hover:text-[#0077CC] p-2 rounded-full hover:bg-[#0F2A5C] transition-colors"
        >
          <span className="material-symbols-outlined text-2xl">close</span>
        </button>

        <span className="font-sans-body text-xs font-bold tracking-widest text-[#0077CC] uppercase block mb-1">
          GUEST EXPERIENCE
        </span>
        <h2 className="font-serif-display font-bold text-2xl text-[#FFFFFF] mb-2">
          Leave Feedback
        </h2>
        <p className="font-sans-body text-xs text-[#9FB0C4] mb-6">
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
                  star <= rating ? 'filled text-[#0077CC]' : 'text-[#9FB0C4]/40'
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
          className="w-full bg-[#050D1D] border border-[#0077CC]/20 rounded-xl p-3.5 text-xs text-[#FFFFFF] focus:outline-none focus:border-[#0077CC] mb-6 font-sans-body"
        />

        <button
          onClick={handleSubmit}
          className="w-full bg-[#0077CC] text-white font-sans-body text-xs font-bold tracking-widest py-3.5 rounded-full hover:bg-[#4DA6E0] transition-colors uppercase"
        >
          SUBMIT FEEDBACK
        </button>
      </div>
    </div>
  );
};
