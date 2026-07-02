export const DEFAULT_EMAIL_FROM = 'Magium <no-reply@magium.app>'

export async function createMailer(config) {
  if (!config.smtpUrl && !config.emailWebhookUrl) {
    return {
      enabled: false,
      async send(message) {
        console.info('[translation-api] email disabled', message.subject, message.to)
      },
    }
  }

  if (config.emailWebhookUrl) {
    return {
      enabled: true,
      async send(message) {
        const outboundMessage = buildOutboundEmail({ config, message })
        const response = await fetch(config.emailWebhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(config.emailWebhookToken ? { authorization: `Bearer ${config.emailWebhookToken}` } : {}),
          },
          body: JSON.stringify(outboundMessage),
        })
        if (!response.ok) {
          throw new Error(`Email webhook returned ${response.status}`)
        }
      },
    }
  }

  const nodemailer = await import('nodemailer')
  const transport = nodemailer.createTransport(config.smtpUrl)
  return {
    enabled: true,
    async send(message) {
      const outboundMessage = buildOutboundEmail({ config, message })
      await transport.sendMail({
        from: outboundMessage.from,
        to: outboundMessage.to,
        subject: outboundMessage.subject,
        text: outboundMessage.text,
      })
    },
  }
}

export function buildOutboundEmail({ config, message }) {
  return {
    ...message,
    from: config.emailFrom || DEFAULT_EMAIL_FROM,
  }
}

export function confirmationEmail({ to, confirmUrl }) {
  return {
    to,
    subject: 'Confirmer le suivi de votre proposition Magium',
    text: [
      'Vous avez demandé à recevoir le suivi d’une proposition de traduction Magium.',
      '',
      'Confirmez cette demande avec ce lien :',
      confirmUrl,
      '',
      'Sans confirmation, aucun email de suivi ne sera envoyé.',
    ].join('\n'),
  }
}

export function proposalClosedEmail({ to, status, publicId, changesetTitle }) {
  const accepted = status === 'published'
  return {
    to,
    subject: accepted ? 'Votre proposition Magium a été publiée' : 'Votre proposition Magium a été traitée',
    text: accepted
      ? `Votre proposition ${publicId} a été publiée dans le lot "${changesetTitle}". Merci pour votre correction.`
      : `Votre proposition ${publicId} a été clôturée avec le statut "${status}".`,
  }
}
