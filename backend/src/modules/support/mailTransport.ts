/**
 * Shared bits for talking to the bloomly_support@pm.me mailbox via Proton Mail Bridge.
 * Bridge exposes a local IMAP/SMTP server with a self-signed certificate — that's expected
 * by design, so certificate verification is only relaxed when the configured host is the
 * loopback/Bridge address, never for a general remote host.
 */
export function isBridgeHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal';
}
