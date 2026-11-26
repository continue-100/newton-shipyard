import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { ApiError } from './auth';

export const SMTP_SENDER = '2392608478@svyasa-sas.edu.in';
export function createOtpSender(
	env: { SMTP_PASSWORD?: string },
	factory = nodemailer.createTransport
) {
	let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
	return async (email: string, code: string, origin: string) => {
		const link = new URL('/', origin);
		link.hash = new URLSearchParams({ email, token: code }).toString();
		const password = env.SMTP_PASSWORD?.replace(/\s/g, '');
		if (!password) throw new ApiError(503, 'Configure the Gmail app password in SMTP_PASSWORD.');
		transport ??= factory({
			host: 'smtp.gmail.com',
			port: 465,
			secure: true,
			auth: { user: SMTP_SENDER, pass: password },
			connectionTimeout: 15_000,
			greetingTimeout: 10_000,
			socketTimeout: 20_000,
			disableFileAccess: true,
			disableUrlAccess: true
		});
		const result = (await transport.sendMail({
			from: { name: 'Shipyard', address: SMTP_SENDER },
			to: email,
			subject: 'Your Shipyard sign-in link',
			text: `Follow this link to sign in to Shipyard: ${link.href}\n\nIt expires in 10 minutes. If you did not request it, ignore this email.`
		})) as SMTPTransport.SentMessageInfo;
		if (!result.accepted?.length || result.rejected?.length)
			throw new Error('SMTP recipient rejected.');
	};
}
