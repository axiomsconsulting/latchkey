import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#2f4a38',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#8a8478', margin: '30px 0 0' }
