import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'FirstFruit Finance — keuangan pribadi dalam satu tempat';
export const contentType = 'image/png';
export const size = { width: 2400, height: 1260 };

const logo = `data:image/svg+xml;base64,${readFileSync(
  join(process.cwd(), 'public', 'brand', 'logo-white.svg'),
).toString('base64')}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, #07110d 0%, #0b2419 48%, #0a3c29 100%)',
          color: '#f4f6f3',
          padding: '142px 170px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 980,
            height: 980,
            borderRadius: 999,
            top: -520,
            right: -160,
            border: '2px solid rgba(91, 233, 170, 0.18)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 720,
            height: 720,
            borderRadius: 999,
            bottom: -500,
            left: 260,
            background: 'rgba(43, 204, 142, 0.08)',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 92,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 430,
              height: 430,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 112,
              background: 'rgba(255, 255, 255, 0.07)',
              border: '2px solid rgba(255, 255, 255, 0.13)',
            }}
          >
            <img src={logo} alt="" width="330" height="330" />
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxWidth: 1370,
            }}
          >
            <div
              style={{
                color: '#5be9aa',
                fontSize: 42,
                fontWeight: 700,
                letterSpacing: 8,
                textTransform: 'uppercase',
                marginBottom: 30,
              }}
            >
              Keuangan pribadi
            </div>
            <div
              style={{
                fontSize: 132,
                lineHeight: 1,
                fontWeight: 800,
                letterSpacing: -6,
              }}
            >
              FirstFruit Finance
            </div>
            <div
              style={{
                marginTop: 42,
                fontSize: 48,
                lineHeight: 1.35,
                color: '#b8c4bd',
              }}
            >
              Dompet, anggaran, langganan, dan rencana dalam satu tempat.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
