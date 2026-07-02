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
        html: outboundMessage.html,
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
  return templateEmail({
    to,
    subject: 'Confirmer le suivi de votre proposition Magium',
    title: 'Confirmez le suivi de votre proposition',
    intro: 'Bonjour,',
    paragraphs: [
      'Merci pour votre contribution à la traduction de Magium.',
      'Pour recevoir un message quand votre proposition aura été traitée, confirmez cette adresse email.',
      'Sans confirmation, aucun email de suivi ne sera envoyé.',
    ],
    action: {
      label: 'Confirmer le suivi',
      url: confirmUrl,
    },
  })
}

export function proposalsPublishedEmail({ to, proposalCount, changesetTitle }) {
  const count = Math.max(1, Number(proposalCount) || 1)
  return templateEmail({
    to,
    subject: count > 1 ? 'Vos corrections Magium ont été publiées' : 'Votre correction Magium a été publiée',
    title: count > 1 ? 'Vos corrections ont été publiées' : 'Votre correction a été publiée',
    intro: 'Bonjour,',
    paragraphs: [
      `Merci pour ${count > 1 ? 'vos contributions' : 'votre contribution'} à la traduction de Magium.`,
      count > 1
        ? `${count} corrections ont été intégrées dans le lot "${changesetTitle}".`
        : `Votre correction a été intégrée dans le lot "${changesetTitle}".`,
      'Merci d’aider à rendre l’aventure plus claire et plus agréable à lire.',
    ],
  })
}

export function proposalsClosedEmail({ to, status, proposalCount }) {
  const count = Math.max(1, Number(proposalCount) || 1)
  const stale = status === 'stale'
  return templateEmail({
    to,
    subject: stale
      ? count > 1 ? 'Vos propositions Magium sont obsolètes' : 'Votre proposition Magium est obsolète'
      : count > 1 ? 'Vos propositions Magium ont été traitées' : 'Votre proposition Magium a été traitée',
    title: stale
      ? count > 1 ? 'Vos propositions sont obsolètes' : 'Votre proposition est obsolète'
      : count > 1 ? 'Vos propositions ont été traitées' : 'Votre proposition a été traitée',
    intro: 'Bonjour,',
    paragraphs: [
      `Merci pour ${count > 1 ? 'vos contributions' : 'votre contribution'} à la traduction de Magium.`,
      stale
        ? count > 1
          ? `${count} propositions ne peuvent plus être appliquées, car le texte concerné a changé depuis leur envoi.`
          : 'Cette proposition ne peut plus être appliquée, car le texte concerné a changé depuis son envoi.'
        : count > 1
          ? `${count} propositions ont été relues mais ne seront pas intégrées en l’état.`
          : 'Cette proposition a été relue mais ne sera pas intégrée en l’état.',
      'Vous pouvez proposer une nouvelle correction depuis le passage visible dans le jeu si nécessaire.',
    ],
  })
}

export function proposalClosedEmail({ to, status, publicId, changesetTitle }) {
  if (status === 'published') {
    return proposalsPublishedEmail({ to, proposalCount: 1, changesetTitle })
  }
  return proposalsClosedEmail({ to, status, proposalCount: 1 })
}

function templateEmail({ to, subject, title, intro, paragraphs, action }) {
  const text = [
    intro,
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(action ? [`${action.label} :`, action.url, ''] : []),
    'L’équipe Magium',
  ].join('\n').trim()
  const actionHtml = action
    ? `<p style="margin: 28px 0 20px;"><a href="${escapeHtml(action.url)}" style="display: inline-block; border-radius: 6px; background: #8f6c1e; color: #ffffff; font-weight: 700; padding: 12px 18px; text-decoration: none;">${escapeHtml(action.label)}</a></p><p style="margin: 0 0 18px; color: #8a8074; font-size: 13px; line-height: 1.5;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><a href="${escapeHtml(action.url)}" style="color: #8f6c1e; overflow-wrap: anywhere;">${escapeHtml(action.url)}</a></p>`
    : ''
  const html = [
    '<!doctype html>',
    '<html lang="fr">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin: 0; background: #111315; color: #ece7dc; font-family: Inter, Segoe UI, Arial, sans-serif;">',
    '<div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">Merci pour votre contribution à la traduction de Magium.</div>',
    '<main style="box-sizing: border-box; width: 100%; padding: 28px 14px;">',
    '<section style="box-sizing: border-box; max-width: 560px; margin: 0 auto; border: 1px solid #373b40; border-radius: 10px; background: #1a1d20; overflow: hidden;">',
    '<header style="border-bottom: 1px solid #373b40; background: #151719; padding: 22px 24px;">',
    '<p style="margin: 0; color: #c7a55a; font-size: 20px; font-weight: 800; letter-spacing: 0;">Magium</p>',
    '</header>',
    '<div style="padding: 26px 24px 24px;">',
    `<h1 style="margin: 0 0 18px; color: #f5ecdd; font-size: 22px; line-height: 1.25;">${escapeHtml(title)}</h1>`,
    `<p style="margin: 0 0 16px; color: #ece7dc; font-size: 15px; line-height: 1.6;">${escapeHtml(intro)}</p>`,
    ...paragraphs.map((paragraph) => `<p style="margin: 0 0 16px; color: #d8d0c5; font-size: 15px; line-height: 1.6;">${escapeHtml(paragraph)}</p>`),
    actionHtml,
    '<p style="margin: 24px 0 0; color: #a9a196; font-size: 14px; line-height: 1.5;">L’équipe Magium</p>',
    '</div>',
    '</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('')
  return { to, subject, text, html }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
