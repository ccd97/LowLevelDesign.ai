export interface FeedbackPayload {
  category: 'feature' | 'bug' | 'general';
  message: string;
  rating?: number;
  name?: string;
  email?: string;
  includeSystemInfo?: boolean;
  systemInfo?: {
    appVersion?: string;
    platform?: string;
  };
}

export interface FeedbackResponse {
  success: boolean;
  message: string;
}

export const FEEDBACK_RECIPIENT_EMAIL = 'dcunha.cyprien@gmail.com';

export const feedbackService = {
  // Electron-only: feedback goes through the main-process IPC handler so
  // origin/referrer headers are set correctly for FormSubmit.
  async sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
    const categoryLabels: Record<FeedbackPayload['category'], string> = {
      feature: 'Feature Request',
      bug: 'Bug Report',
      general: 'General Feedback',
    };

    const categoryLabel = categoryLabels[payload.category] || 'Feedback';
    const ratingDisplay = payload.rating ? `${payload.rating} / 5 Stars` : 'Not rated';

    const bodyData: Record<string, any> = {
      _subject: `[LLD Practice Feedback] ${categoryLabel} - ${new Date().toLocaleDateString()}`,
      _template: 'table',
      _captcha: 'false',
      Category: categoryLabel,
      Rating: ratingDisplay,
      Message: payload.message.trim(),
      Sender_Name: payload.name?.trim() || 'Anonymous User',
      Sender_Email: payload.email?.trim() || 'Not provided',
      Submitted_At: new Date().toISOString(),
    };

    // If user provided email, configure reply-to so developer can respond directly
    if (payload.email?.trim()) {
      bodyData._replyto = payload.email.trim();
      bodyData.email = payload.email.trim();
    }

    if (payload.includeSystemInfo && payload.systemInfo) {
      if (payload.systemInfo.appVersion) {
        bodyData.App_Version = payload.systemInfo.appVersion;
      }
      if (payload.systemInfo.platform) {
        bodyData.Platform_OS = payload.systemInfo.platform;
      }
    }

    try {
      const result = await window.electronAPI.sendFeedback(bodyData);
      if (result.message && /needs Activation/i.test(result.message)) {
        return {
          success: true,
          message: "Feedback submitted! FormSubmit sent an 'Activate Form' link to your email. Click the link in your inbox to complete activation.",
        };
      }
      return result;
    } catch (error: any) {
      console.error('Error submitting feedback via FormSubmit:', error);
      return {
        success: false,
        message: error?.message || 'Network error: Unable to submit feedback. Please check your internet connection.',
      };
    }
  },
};
