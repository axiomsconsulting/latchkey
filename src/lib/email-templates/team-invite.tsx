import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface TeamInviteProps {
  hostName?: string
  inviter?: string
  roleLine?: string
  url?: string
}

/** Invitation to help run a host's rooms in Latchkey. */
function TeamInvite({ hostName = 'a host', inviter = 'Someone', roleLine = '', url = '#' }: TeamInviteProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Join ${hostName} on Latchkey`}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', color: '#2c2a26' }}>
        <Container style={{ padding: '32px 24px', maxWidth: '560px' }}>
          <Heading style={{ fontFamily: 'Fraunces, Georgia, serif', color: '#1f4d3a', fontSize: '24px' }}>
            Join {hostName} on Latchkey
          </Heading>
          <Text style={{ fontSize: '15px', lineHeight: '22px' }}>
            {inviter} has invited you to help with {hostName}. {roleLine}
          </Text>
          <Button
            href={url}
            style={{ backgroundColor: '#1f4d3a', color: '#ffffff', borderRadius: '12px', padding: '14px 22px', fontSize: '15px', fontWeight: 600 }}
          >
            Accept the invitation
          </Button>
          <Text style={{ fontSize: '13px', color: '#7a6f62', marginTop: '24px' }}>
            The link works for 7 days. Sign in or create your account with this email address to accept. If you weren't
            expecting this, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TeamInvite,
  subject: (d: Record<string, any>) => `Join ${String(d['hostName'] ?? 'a host')} on Latchkey`,
  displayName: 'Team invitation',
  previewData: {
    hostName: 'The Hill Suites',
    inviter: 'owner@example.com',
    roleLine: 'As a manager you can run rooms, calendars, bookings and guides.',
    url: 'https://latchkey.omsestates.uk/invite/example',
  },
} satisfies TemplateEntry
