import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your password for {siteName}. Click
          the button below to choose a new password.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={footer}>
          If you didn't request a password reset, you can safely ignore this
          email. Your password will not be changed.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#faf6ef', fontFamily: 'Georgia, serif' }
const container = { padding: '28px 28px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e8e0d2', margin: '24px auto', maxWidth: '520px' }
const h1 = {
  fontSize: '22px',
  fontFamily: 'Georgia, serif',
  fontWeight: 'bold' as const,
  color: '#2f4a38',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#4a4640',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: '#2f4a38',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #2f4a38',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#8a8478', margin: '30px 0 0' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #2f4a38 !important; color: #ffffff !important; }
  }
  [data-ogsc] .dm-btn { background-color: #2f4a38 !important; color: #ffffff !important; }
  [data-ogsb] .dm-btn { background-color: #2f4a38 !important; color: #ffffff !important; }
`
