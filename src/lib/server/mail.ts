import { RESEND_API_KEY } from '$app/env/private';

const FROM = 'Novastack <noreply@novastack.gg>';

export async function sendEmail(to: string, subject: string, html: string) {
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ from: FROM, to, subject, html })
	});

	if (!response.ok) {
		throw new Error(`Resend send failed: ${response.status} ${await response.text()}`);
	}
}
