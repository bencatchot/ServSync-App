import type { ActionFeedbackMessage } from '../feedback/ActionFeedback';

export function actionFeedbackMessage(title: string, body?: string, testId?: string): ActionFeedbackMessage {
  return { title, body, testId };
}
