import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';

const DDZ_BROADCAST_MESSAGES = [
  '玩家【金百万】在天地癞子宗师场打出 8 连炸，狂揽 128,000 欢乐豆！',
  '玩家【贝儿】不洗牌模式连胜 6 局，达成「富甲一方」荣耀！',
  '恭喜玩家【陆九渊】在残局闯关中一展神技，成功通关并领取高额赏金！',
  '每日签到火热进行中，连续签到 7 天必得黄金福禄宝箱与专属房卡！',
  '玩家【柳如风】在初级场凭一记神级春天，单局翻倍夺得 38,400 豆！',
];

const MAHJONG_BROADCAST_MESSAGES = [
  '玩家【天府雀圣】在红中血流连摸 4 张红中，达成「八方来贺」神级满番！',
  '玩家【蜀道难】在血战到底场绝杀金钩钓，单局四归一狂揽 128,000 豆！',
  '玩家【锦里一枝花】凭借清一色连胡 6 掌，荣登今日川麻富豪榜首！',
  '恭喜玩家【蓉城少侠】在红中场连续刮风下雨，单局进账 68,000 豆！',
  '正宗四川红中血流火热开战中，连胡到底不倒牌，随时一键开局！',
];

export interface MarqueeTickerProps {
  gameType?: 'ddz' | 'mahjong' | 'portal';
}

export const MarqueeTicker: React.FC<MarqueeTickerProps> = ({ gameType = 'portal' }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'enter' | 'exit'>('enter');

  const messages = gameType === 'mahjong' ? MAHJONG_BROADCAST_MESSAGES : DDZ_BROADCAST_MESSAGES;

  useEffect(() => {
    setCurrentIndex(0);
  }, [gameType]);

  useEffect(() => {
    const timer = setInterval(() => {
      setFadeState('exit');
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length);
        setFadeState('enter');
      }, 400);
    }, 5500);

    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div className="relative z-10 mx-auto flex h-6 w-full max-w-4xl shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-400/25 bg-[#140b07]/80 px-3 shadow-inner backdrop-blur-xs">
      <div className="flex items-center gap-1.5 text-amber-300">
        <Volume2 className="h-3 w-3 shrink-0 text-amber-400" />
        <span className="font-mono text-[10px] font-black uppercase tracking-wider text-amber-400/90">
          全服快讯
        </span>
      </div>

      <div className="mx-2 h-2.5 w-px bg-amber-400/25" />

      <div className="min-w-0 flex-1 overflow-hidden">
        <p
          className={`truncate text-[11px] font-bold text-amber-100 transition-all duration-400 ${
            fadeState === 'enter'
              ? 'translate-y-0 opacity-100'
              : '-translate-y-2 opacity-0'
          }`}
        >
          {messages[currentIndex]}
        </p>
      </div>
    </div>
  );
};
