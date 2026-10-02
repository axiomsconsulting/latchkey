import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface NoticeProps {
  title?: string
  body?: string
  from?: string
}

/** Plain, warm notice used for guest receipts and host alerts. */
function Notice({ title = 'A note from Latchkey', body = '', from = 'Latchkey' }: NoticeProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{title}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', color: '#2c2a26' }}>
        <Container style={{ padding: '32px 24px', maxWidth: '560px' }}>
          <Heading style={{ fontFamily: 'Fraunces, Georgia, serif', color: '#1f4d3a', fontSize: '24px' }}>{title}</Heading>
          {body.split('\n').map((line, i) => (
            <Text key={i} style={{ fontSize: '15px', lineHeight: '22px', margin: '0 0 6px' }}>{line || '\u00a0'}</Text>
          ))}
          <Text style={{ fontSize: '13px', color: '#7a6f62', marginTop: '24px' }}>{from}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Notice,
  subject: (d: Record<string, any>) => String(d['title'] ?? 'A note from Latchkey'),
  displayName: 'Receipt / alert notice',
  previewData: { title: 'Receipt R-1042 · The Trinity Rooms', body: '2 × Fresh towels\n1 × Late check-out\n\nTotal: £10.00\nPaid by: card', from: 'The Trinity Rooms' },
} satisfies TemplateEntry
