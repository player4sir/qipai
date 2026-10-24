import React from 'react';

export type SpineCharacterId =
  | 'noble'
  | 'scholar'
  | 'heroine'
  | 'warrior'
  | 'kashen'
  | 'beier';

export type SpineAnimState = 'idle' | 'think' | 'play' | 'bomb' | 'win' | 'lose';

export interface SpineCharacterMeta {
  id: SpineCharacterId;
  name: string;
  title: string;
  rarity: 'SSR' | 'SR';
  signatureSkill: string;
  voiceLine: string;
  accentColor: string;
}

export const SPINE_CHARACTER_LIST: SpineCharacterMeta[] = [
  {
    id: 'noble',
    name: '金百万',
    title: '富贵地主员外',
    rarity: 'SSR',
    signatureSkill: '金算盘 · 封顶加成感知',
    voiceLine: '金陵城里数家珍，这把地主归老夫！',
    accentColor: '#F59E0B',
  },
  {
    id: 'kashen',
    name: '陆九渊',
    title: '传奇牌坛卡神',
    rarity: 'SSR',
    signatureSkill: '天眼记牌 · 15阶直方图推演',
    voiceLine: '乾坤五十四张牌，尽在指尖方寸间。',
    accentColor: '#A855F7',
  },
  {
    id: 'beier',
    name: '贝儿',
    title: '祈愿锦鲤少女',
    rarity: 'SSR',
    signatureSkill: '锦鲤附体 · 天地双癞奇遇',
    voiceLine: '好运锦鲤跳龙门，顺子飞机全都来！',
    accentColor: '#FB7185',
  },
  {
    id: 'scholar',
    name: '柳如风',
    title: '江南折扇书生',
    rarity: 'SR',
    signatureSkill: '步步为营 · 零损选翼拆牌',
    voiceLine: '羽扇纶巾谈笑间，阁下底牌已看穿。',
    accentColor: '#34D399',
  },
  {
    id: 'heroine',
    name: '红拂女',
    title: '临安红衣侠女',
    rarity: 'SR',
    signatureSkill: '惊鸿连击 · 不洗牌连炸',
    voiceLine: '红袖凌风剑气寒，且看本姑娘四带二！',
    accentColor: '#F472B6',
  },
  {
    id: 'warrior',
    name: '凌霄',
    title: '姑苏金甲剑客',
    rarity: 'SR',
    signatureSkill: '破釜沉舟 · 超级加倍决胜',
    voiceLine: '十步一剑破长空，王炸一出谁与争锋！',
    accentColor: '#60A5FA',
  },
];

export interface AvatarSvgProps {
  avatarId: string;
  size?: number;
  isLandlord?: boolean;
  animState?: SpineAnimState;
  className?: string;
}

/**
 * Multi-layered Spine-style articulated Chinese character portraits (SVG Skeletal Vector Art).
 * Supports 6 characters (noble, scholar, heroine, warrior, kashen, beier) and
 * 6 Spine 3.8 animation states (idle, think, play, bomb, win, lose).
 */
export const AvatarSvg: React.FC<AvatarSvgProps> = ({
  avatarId,
  size = 48,
  isLandlord = false,
  animState = 'idle',
  className = '',
}) => {
  const uid = React.useId().replace(/:/g, '');
  const validIds: SpineCharacterId[] = [
    'noble',
    'scholar',
    'heroine',
    'warrior',
    'kashen',
    'beier',
  ];
  const type: SpineCharacterId = validIds.includes(avatarId as SpineCharacterId)
    ? (avatarId as SpineCharacterId)
    : 'noble';

  const outerRimColor = isLandlord
    ? '#FBBF24'
    : type === 'noble'
      ? '#F59E0B'
      : type === 'scholar'
        ? '#34D399'
        : type === 'heroine'
          ? '#F472B6'
          : type === 'kashen'
            ? '#C084FC'
            : type === 'beier'
              ? '#FB7185'
              : '#60A5FA';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 rounded-full shadow-md ${className}`}
    >
      <defs>
        <style>{`
          @keyframes spineBreath_${uid} {
            0%, 100% { transform: translateY(0px) scaleY(1); }
            50% { transform: translateY(-1.4px) scaleY(1.018); }
          }
          @keyframes spineThink_${uid} {
            0%, 100% { transform: rotate(-3deg) translateY(0px); }
            50% { transform: rotate(3.5deg) translateY(-1.5px); }
          }
          @keyframes spinePlay_${uid} {
            0%, 100% { transform: translateY(0px) scale(1); }
            40% { transform: translateY(-3px) scale(1.05) rotate(-2deg); }
          }
          @keyframes spineBomb_${uid} {
            0%, 100% { transform: scale(1) rotate(0deg); }
            25% { transform: scale(1.08) rotate(-4deg); }
            75% { transform: scale(1.08) rotate(4deg); }
          }
          @keyframes spineWin_${uid} {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-3.5px) scale(1.06); }
          }
          @keyframes spineLose_${uid} {
            0%, 100% { transform: translateY(1.5px) rotate(-2deg); }
            50% { transform: translateY(2.5px) rotate(2deg); }
          }
          .bone-root-${uid} {
            transform-origin: 40px 56px;
            animation: ${
              animState === 'think'
                ? `spineThink_${uid} 2.2s ease-in-out infinite`
                : animState === 'play'
                  ? `spinePlay_${uid} 1.1s ease-in-out infinite`
                  : animState === 'bomb'
                    ? `spineBomb_${uid} 0.75s ease-in-out infinite`
                    : animState === 'win'
                      ? `spineWin_${uid} 0.95s ease-in-out infinite`
                      : animState === 'lose'
                        ? `spineLose_${uid} 2.8s ease-in-out infinite`
                        : `spineBreath_${uid} 3.2s ease-in-out infinite`
            };
          }
        `}</style>

        <radialGradient id={`bg_${uid}`} cx="50%" cy="35%" r="65%">
          {type === 'noble' && (
            <>
              <stop offset="0%" stopColor="#7C2D12" />
              <stop offset="100%" stopColor="#270E0A" />
            </>
          )}
          {type === 'scholar' && (
            <>
              <stop offset="0%" stopColor="#065F46" />
              <stop offset="100%" stopColor="#041E17" />
            </>
          )}
          {type === 'heroine' && (
            <>
              <stop offset="0%" stopColor="#831843" />
              <stop offset="100%" stopColor="#2A0818" />
            </>
          )}
          {type === 'warrior' && (
            <>
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="100%" stopColor="#0B1536" />
            </>
          )}
          {type === 'kashen' && (
            <>
              <stop offset="0%" stopColor="#581C87" />
              <stop offset="100%" stopColor="#17072B" />
            </>
          )}
          {type === 'beier' && (
            <>
              <stop offset="0%" stopColor="#9F1239" />
              <stop offset="100%" stopColor="#2C0614" />
            </>
          )}
        </radialGradient>

        <linearGradient id={`gold_${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>

        <linearGradient id={`skin_${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFEDD5" />
          <stop offset="100%" stopColor="#FDBA8C" />
        </linearGradient>

        <clipPath id={`clip_${uid}`}>
          <circle cx="40" cy="40" r="37" />
        </clipPath>
      </defs>

      {/* Outer Medallion Base */}
      <circle
        cx="40"
        cy="40"
        r="38.5"
        fill={`url(#bg_${uid})`}
        stroke={`url(#gold_${uid})`}
        strokeWidth="2.5"
      />
      <circle
        cx="40"
        cy="40"
        r="35.5"
        stroke={outerRimColor}
        strokeOpacity="0.5"
        strokeWidth="1.2"
      />

      {/* Decorative Cloud Halo & Skeletal Root Group */}
      <g clipPath={`url(#clip_${uid})`}>
        <circle
          cx="40"
          cy="36"
          r="24"
          fill={animState === 'bomb' ? '#F59E0B' : '#FFFFFF'}
          fillOpacity={animState === 'bomb' ? '0.2' : '0.05'}
        />

        <g className={`bone-root-${uid}`}>
          {/* === CHARACTER 1: NOBLE LANDLORD (金百万·富贵员外) === */}
          {type === 'noble' && (
            <g>
              <path
                d="M12 78C14 57 25 50 40 50C55 50 66 57 68 78H12Z"
                fill="#991B1B"
                stroke={`url(#gold_${uid})`}
                strokeWidth="2"
              />
              <path d="M28 50L40 66L52 50" stroke={`url(#gold_${uid})`} strokeWidth="3" />
              <ellipse cx="40" cy="68" rx="7" ry="4" fill={`url(#gold_${uid})`} />

              <circle cx="24" cy="37" r="4" fill="#FDBA8C" />
              <circle cx="56" cy="37" r="4" fill="#FDBA8C" />
              <ellipse cx="40" cy="37" rx="15" ry="14.5" fill={`url(#skin_${uid})`} />

              <ellipse cx="30" cy="40" rx="3.2" ry="1.8" fill="#F87171" fillOpacity="0.45" />
              <ellipse cx="50" cy="40" rx="3.2" ry="1.8" fill="#F87171" fillOpacity="0.45" />

              <path d="M29 31Q33 28.5 36 31" stroke="#451A03" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M44 31Q47 28.5 51 31" stroke="#451A03" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="33" cy="35" r="2.1" fill="#1C1917" />
              <circle cx="47" cy="35" r="2.1" fill="#1C1917" />
              <circle cx="32.3" cy="34.3" r="0.7" fill="#FFFFFF" />
              <circle cx="46.3" cy="34.3" r="0.7" fill="#FFFFFF" />

              <path
                d={animState === 'lose' ? 'M35 44C37 42 43 42 45 44' : 'M34 42.5C36.5 45 43.5 45 46 42.5'}
                stroke="#7C2D12"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M39 41C34 40.5 29 42.5 26 45M41 41C46 40.5 51 42.5 54 45"
                stroke="#292524"
                strokeWidth="2.2"
                strokeLinecap="round"
              />

              <path
                d="M22 27C22 15 29 10 40 10C51 10 58 15 58 27H22Z"
                fill="#7F1D1D"
                stroke={`url(#gold_${uid})`}
                strokeWidth="2"
              />
              <rect
                x="20"
                y="24"
                width="40"
                height="5.5"
                rx="2.75"
                fill="#B45309"
                stroke={`url(#gold_${uid})`}
                strokeWidth="1.5"
              />
              <circle cx="40" cy="24" r="4.5" fill={`url(#gold_${uid})`} />
              <circle cx="40" cy="24" r="2.6" fill="#10B981" />
              <circle cx="40" cy="9.5" r="3" fill={`url(#gold_${uid})`} />
            </g>
          )}

          {/* === CHARACTER 2: JIANGNAN SCHOLAR (柳如风·折扇书生) === */}
          {type === 'scholar' && (
            <g>
              <path
                d="M14 78C16 57 26 50 40 50C54 50 64 57 66 78H14Z"
                fill="#047857"
                stroke="#A7F3D0"
                strokeWidth="1.8"
              />
              <path d="M29 50L40 65L51 50" stroke="#ECFDF5" strokeWidth="2.5" />

              <path d="M25 26V46" stroke="#1E293B" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M55 26V46" stroke="#1E293B" strokeWidth="3.5" strokeLinecap="round" />

              <ellipse cx="40" cy="36.5" rx="13.5" ry="14" fill={`url(#skin_${uid})`} />
              <path d="M30 31L36 32" stroke="#1E293B" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M50 31L44 32" stroke="#1E293B" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="33.5" cy="35.5" r="2" fill="#0F172A" />
              <circle cx="46.5" cy="35.5" r="2" fill="#0F172A" />
              <circle cx="33" cy="34.8" r="0.7" fill="#FFFFFF" />
              <circle cx="46" cy="34.8" r="0.7" fill="#FFFFFF" />
              <path
                d={animState === 'lose' ? 'M36 44C38 42.5 42 42.5 44 44' : 'M36 42.5C38 44.2 42 44.2 44 42.5'}
                stroke="#9A3412"
                strokeWidth="1.8"
                strokeLinecap="round"
              />

              <path
                d="M25 25L28 11H52L55 25H25Z"
                fill="#064E3B"
                stroke="#6EE7B7"
                strokeWidth="1.6"
              />
              <rect
                x="24"
                y="23"
                width="32"
                height="4"
                rx="2"
                fill="#047857"
                stroke="#A7F3D0"
                strokeWidth="1.2"
              />
              <circle cx="40" cy="19" r="3" fill="#A7F3D0" />

              <path
                d="M24 72C28 58 52 58 56 72L40 75L24 72Z"
                fill="#FEF3C7"
                stroke={`url(#gold_${uid})`}
                strokeWidth="1.5"
              />
              <path d="M40 75L32 61M40 75L40 59M40 75L48 61" stroke="#D97706" strokeWidth="1" />
            </g>
          )}

          {/* === CHARACTER 3: LIN'AN HEROINE (红拂女·临安侠女) === */}
          {type === 'heroine' && (
            <g>
              <ellipse cx="40" cy="38" rx="18" ry="17" fill="#18181B" />

              <path
                d="M14 78C17 58 27 51 40 51C53 51 63 58 66 78H14Z"
                fill="#BE185D"
                stroke={`url(#gold_${uid})`}
                strokeWidth="1.8"
              />
              <path d="M30 51L40 65L50 51" stroke="#FBCFE8" strokeWidth="2.4" />

              <ellipse cx="40" cy="37" rx="13" ry="13.5" fill={`url(#skin_${uid})`} />

              <path
                d="M26 32C28 22 35 20 40 24C45 20 52 22 54 32C50 27 45 26 40 28C35 26 30 27 26 32Z"
                fill="#18181B"
              />

              <path d="M40 27.5L41.8 30L40 32.5L38.2 30L40 27.5Z" fill="#E11D48" />

              <ellipse cx="30" cy="39.5" rx="3" ry="1.6" fill="#FB7185" fillOpacity="0.5" />
              <ellipse cx="50" cy="39.5" rx="3" ry="1.6" fill="#FB7185" fillOpacity="0.5" />
              <circle cx="33.5" cy="35.5" r="2.3" fill="#18181B" />
              <circle cx="46.5" cy="35.5" r="2.3" fill="#18181B" />
              <circle cx="32.8" cy="34.7" r="0.8" fill="#FFFFFF" />
              <circle cx="45.8" cy="34.7" r="0.8" fill="#FFFFFF" />
              <path
                d={animState === 'lose' ? 'M37 44Q40 42 43 44' : 'M37 42.5Q40 44.5 43 42.5'}
                stroke="#E11D48"
                strokeWidth="2"
                strokeLinecap="round"
              />

              <circle cx="28" cy="17" r="6" fill="#18181B" stroke={`url(#gold_${uid})`} strokeWidth="1.5" />
              <circle cx="52" cy="17" r="6" fill="#18181B" stroke={`url(#gold_${uid})`} strokeWidth="1.5" />
              <circle cx="28" cy="17" r="2.5" fill="#F43F5E" />
              <circle cx="52" cy="17" r="2.5" fill="#F43F5E" />
              <path
                d="M18 14L27 17M62 14L53 17"
                stroke={`url(#gold_${uid})`}
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>
          )}

          {/* === CHARACTER 4: GUSU SWORDSMAN (凌霄·姑苏剑客) === */}
          {type === 'warrior' && (
            <g>
              <path d="M56 14L65 5" stroke={`url(#gold_${uid})`} strokeWidth="3.5" strokeLinecap="round" />
              <path d="M52 16L61 21" stroke={`url(#gold_${uid})`} strokeWidth="2.5" strokeLinecap="round" />

              <path
                d="M12 78C15 56 26 50 40 50C54 50 65 56 68 78H12Z"
                fill="#1E3A8A"
                stroke={`url(#gold_${uid})`}
                strokeWidth="2"
              />
              <path d="M13 60Q20 50 29 53" stroke={`url(#gold_${uid})`} strokeWidth="3" strokeLinecap="round" />
              <path d="M67 60Q60 50 51 53" stroke={`url(#gold_${uid})`} strokeWidth="3" strokeLinecap="round" />
              <path d="M30 50L40 66L50 50" stroke={`url(#gold_${uid})`} strokeWidth="2.5" />

              <ellipse cx="40" cy="36.5" rx="13.8" ry="14" fill={`url(#skin_${uid})`} />

              <path d="M28.5 32L36.5 33.5" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" />
              <path d="M51.5 32L43.5 33.5" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" />
              <circle cx="33.5" cy="36" r="2.1" fill="#0F172A" />
              <circle cx="46.5" cy="36" r="2.1" fill="#0F172A" />
              <circle cx="33" cy="35.3" r="0.7" fill="#FFFFFF" />
              <circle cx="46" cy="35.3" r="0.7" fill="#FFFFFF" />
              <path d="M36 43H44" stroke="#7C2D12" strokeWidth="2" strokeLinecap="round" />

              <path
                d="M25 31C26 20 32 18 40 21C48 18 54 20 55 31C50 25 30 25 25 31Z"
                fill="#0F172A"
              />
              <rect
                x="33"
                y="10"
                width="14"
                height="10"
                rx="3"
                fill="#0F172A"
                stroke={`url(#gold_${uid})`}
                strokeWidth="2"
              />
              <circle cx="40" cy="15" r="2.5" fill="#38BDF8" />
            </g>
          )}

          {/* === CHARACTER 5: CARD GOD KASHEN (陆九渊·传奇牌坛卡神) === */}
          {type === 'kashen' && (
            <g>
              {/* Floating Golden Poker Cards Behind Shoulders */}
              <rect
                x="14"
                y="24"
                width="10"
                height="15"
                rx="2"
                transform="rotate(-22 14 24)"
                fill="#FEF08A"
                stroke="#B45309"
                strokeWidth="1.2"
              />
              <rect
                x="56"
                y="19"
                width="10"
                height="15"
                rx="2"
                transform="rotate(22 56 19)"
                fill="#FEF08A"
                stroke="#B45309"
                strokeWidth="1.2"
              />

              {/* Imperial Purple & Gold Daoist/Grandmaster Robe */}
              <path
                d="M12 78C15 56 26 50 40 50C54 50 65 56 68 78H12Z"
                fill="#4C1D95"
                stroke={`url(#gold_${uid})`}
                strokeWidth="2"
              />
              <path d="M28 50L40 67L52 50" stroke="#E9D5FF" strokeWidth="2.5" />
              <circle cx="40" cy="67" r="4" fill={`url(#gold_${uid})`} />

              {/* Silver-White Grandmaster Side Locks */}
              <path d="M25 25V47" stroke="#E2E8F0" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M55 25V47" stroke="#E2E8F0" strokeWidth="3.5" strokeLinecap="round" />

              {/* Face */}
              <ellipse cx="40" cy="36.5" rx="13.5" ry="14" fill={`url(#skin_${uid})`} />

              {/* Golden Eye of Insight Mark on Forehead */}
              <path d="M40 26L42 29.5L40 32L38 29.5L40 26Z" fill="#FBBF24" />

              {/* Sharp Eyes & Confident Smile */}
              <path d="M29 31.5L36 32.5" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
              <path d="M51 31.5L44 32.5" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
              <circle cx="33.5" cy="35.5" r="2.1" fill="#3B0764" />
              <circle cx="46.5" cy="35.5" r="2.1" fill="#3B0764" />
              <circle cx="33" cy="34.8" r="0.8" fill="#FEF08A" />
              <circle cx="46" cy="34.8" r="0.8" fill="#FEF08A" />
              <path
                d="M35.5 42.5C38 44.5 42 44.5 44.5 42.5"
                stroke="#7C2D12"
                strokeWidth="1.8"
                strokeLinecap="round"
              />

              {/* Grandmaster Celestial Crown */}
              <path
                d="M27 24L31 10H49L53 24H27Z"
                fill="#2E1065"
                stroke={`url(#gold_${uid})`}
                strokeWidth="1.8"
              />
              <circle cx="40" cy="17" r="3.5" fill={`url(#gold_${uid})`} />
            </g>
          )}

          {/* === CHARACTER 6: LUCKY KOI BEIER (贝儿·祈愿锦鲤少女) === */}
          {type === 'beier' && (
            <g>
              {/* Warm Chestnut Hair Back */}
              <ellipse cx="40" cy="39" rx="18" ry="17" fill="#451A03" />

              {/* Festive Coral-Gold Koi Dress */}
              <path
                d="M14 78C17 58 27 51 40 51C53 51 63 58 66 78H14Z"
                fill="#E11D48"
                stroke={`url(#gold_${uid})`}
                strokeWidth="1.8"
              />
              <path d="M30 51L40 64L50 51" stroke="#FEF08A" strokeWidth="2.5" />
              <circle cx="40" cy="64" r="3.5" fill={`url(#gold_${uid})`} />

              {/* Face */}
              <ellipse cx="40" cy="37" rx="13.2" ry="13.5" fill={`url(#skin_${uid})`} />

              {/* Cute Curved Bangs */}
              <path
                d="M26 31C28 21 35 20 40 23C45 20 52 21 54 31C49 26 31 26 26 31Z"
                fill="#451A03"
              />

              {/* Sparkly Eyes & Rosy Cheeks */}
              <ellipse cx="29.5" cy="39.5" rx="3.2" ry="1.8" fill="#FB7185" fillOpacity="0.6" />
              <ellipse cx="50.5" cy="39.5" rx="3.2" ry="1.8" fill="#FB7185" fillOpacity="0.6" />
              <circle cx="33.5" cy="35.5" r="2.4" fill="#270E0A" />
              <circle cx="46.5" cy="35.5" r="2.4" fill="#270E0A" />
              <circle cx="32.7" cy="34.6" r="0.9" fill="#FFFFFF" />
              <circle cx="45.7" cy="34.6" r="0.9" fill="#FFFFFF" />
              <path
                d="M36.5 42Q40 45 43.5 42"
                stroke="#E11D48"
                strokeWidth="2"
                strokeLinecap="round"
              />

              {/* Twin Koi Buns with Gold Tassels */}
              <circle cx="25" cy="18" r="6.5" fill="#451A03" stroke={`url(#gold_${uid})`} strokeWidth="1.6" />
              <circle cx="55" cy="18" r="6.5" fill="#451A03" stroke={`url(#gold_${uid})`} strokeWidth="1.6" />
              <circle cx="25" cy="18" r="3" fill="#FB7185" />
              <circle cx="55" cy="18" r="3" fill="#FB7185" />
              <path d="M23 24V31M57 24V31" stroke="#FBBF24" strokeWidth="1.8" strokeLinecap="round" />
            </g>
          )}

          {/* Action State Prop Overlay (Think / Play / Bomb / Win) */}
          {animState === 'think' && (
            <g transform="translate(52, 46)">
              <circle cx="10" cy="10" r="8" fill="#064E3B" stroke="#6EE7B7" strokeWidth="1.5" />
              <text x="10" y="13.5" textAnchor="middle" fill="#FEF08A" fontSize="10" fontWeight="bold">
                ?
              </text>
            </g>
          )}
          {animState === 'play' && (
            <g transform="translate(53, 45)">
              <rect
                x="2"
                y="1"
                width="12"
                height="16"
                rx="2"
                transform="rotate(14 8 9)"
                fill="#FFFFFF"
                stroke="#F59E0B"
                strokeWidth="1.5"
              />
              <text x="8" y="12" textAnchor="middle" fill="#DC2626" fontSize="9" fontWeight="bold">
                A
              </text>
            </g>
          )}
          {animState === 'bomb' && (
            <g transform="translate(50, 44)">
              <circle cx="12" cy="12" r="9" fill="#991B1B" stroke="#FBBF24" strokeWidth="2" />
              <path d="M12 5L14 10L19 12L14 14L12 19L10 14L5 12L10 10L12 5Z" fill="#FEF08A" />
            </g>
          )}
        </g>
      </g>

      {/* Landlord Crown Badge Overlay on Top-Right if Landlord */}
      {isLandlord && (
        <g transform="translate(52, 2)">
          <circle cx="12" cy="12" r="11" fill="#78350F" stroke={`url(#gold_${uid})`} strokeWidth="2" />
          <path d="M6 16L7.5 9L12 12.5L16.5 9L18 16H6Z" fill={`url(#gold_${uid})`} />
        </g>
      )}
    </svg>
  );
};
