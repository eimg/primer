export interface Notification {
  id: string;
  recipient: string;
  template: string;
}

export interface MailGateway {
  send(input: Notification & { idempotencyKey: string }): Promise<void>;
}

/** TF-184: every attempt for one logical notification must reuse notification.id. */
export async function retryNotification(
  gateway: MailGateway,
  notification: Notification,
  maxAttempts = 3,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await gateway.send({ ...notification, idempotencyKey: notification.id });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
