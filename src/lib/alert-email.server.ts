/**
 * Emails a host alert. Sending needs a verified sender domain; until one is
 * set up this returns false and the alert still appears on the Today page.
 */
export async function sendAlertEmail(_hostId: string, _message: string): Promise<boolean> {
  return false;
}
