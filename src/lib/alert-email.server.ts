/**
 * Emails a host alert. Sending needs a verified sender domain; until one is
 * set up this returns false and the alert still appears on the Today page.
 */
export async function sendAlertEmail(_hostId: string, _message: string): Promise<boolean> {
  return false;
}

/**
 * Emails a guest (receipts). Same story: no verified sender domain yet, so
 * this returns false and the app tells the guest to save or print instead.
 * Never pretend a message was sent.
 */
export async function sendGuestEmail(_args: { to: string; subject: string; body: string }): Promise<boolean> {
  return false;
}
