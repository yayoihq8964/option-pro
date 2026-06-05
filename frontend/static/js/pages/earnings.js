export function mountEarnings(root) {
  const days = ["周一", "周二", "周三", "周四", "周五"];
  const events = [
    [
      "NVDA",
      "AI 加速器毛利率",
      "供应链数据指向数据中心需求延续强势，隐含波动率处于 80% 分位。",
      "84% 看涨",
    ],
    [
      "TSLA",
      "交付量与利润率",
      "市场关注价格战对汽车毛利率的影响，Put skew 维持高位。",
      "58% 分歧",
    ],
    [
      "AMZN",
      "云业务增速",
      "AWS 增长预期改善，广告业务成为额外上行催化。",
      "72% 看涨",
    ],
  ];
  root.innerHTML = `<div class="space-y-lg fade-in"><section class="card p-xl"><div class="flex flex-col md:flex-row justify-between gap-lg"><div><div class="flex items-center gap-md"><span class="material-symbols-outlined text-primary icon-fill">psychology</span><h1 class="font-headline-lg-mobile md:font-headline-lg">AI 财报中心</h1></div><p class="text-on-surface-variant mt-sm">整合财报日历、事件波动与分析师情绪的预判工作台。</p></div><div class="flex items-center gap-sm"><button class="px-md py-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high"><span class="material-symbols-outlined">chevron_left</span></button><span class="font-label-sm text-on-surface-variant uppercase">本周财报</span><button class="px-md py-sm rounded-xl bg-surface-container-low hover:bg-surface-container-high"><span class="material-symbols-outlined">chevron_right</span></button></div></div></section><div class="grid grid-cols-12 gap-gutter"><section class="col-span-12 lg:col-span-8 card p-xl"><h2 class="font-headline-md mb-lg">财报日历</h2><div class="grid grid-cols-1 md:grid-cols-5 gap-sm">${days
    .map(
      (d, i) =>
        `<div class="rounded-xl bg-surface-container-low p-md min-h-40"><p class="font-label-sm text-on-surface-variant uppercase mb-md">${d}</p>${[
          ["AMD", "盘前"],
          ["MSFT", "盘后"],
          ["META", "盘后"],
          ["AAPL", "盘后"],
          ["XOM", "盘前"],
        ]
          .slice(i, i + 2)
          .map(
            (x) =>
              `<div class="bg-white rounded-lg p-sm mb-sm shadow-[0_4px_14px_rgba(0,0,0,.03)]"><b class="text-primary">${x[0]}</b><p class="text-label-sm text-on-surface-variant">${x[1]}</p></div>`,
          )
          .join("")}</div>`,
    )
    .join(
      "",
    )}</div></section><aside class="col-span-12 lg:col-span-4 card p-xl"><h2 class="font-headline-md mb-lg">分析师情绪</h2><div class="relative h-44 rounded-full mx-auto w-44 bg-conic-gradient flex items-center justify-center" style="background:conic-gradient(#006c49 0 68%,#dce9ff 68% 100%)"><div class="h-32 w-32 rounded-full bg-white flex flex-col items-center justify-center"><b class="font-display text-3xl text-secondary">68%</b><span class="text-label-sm text-on-surface-variant">正面</span></div></div><div class="mt-lg grid grid-cols-3 gap-sm text-center"><div><b class="positive">24</b><p class="text-label-sm text-on-surface-variant">买入</p></div><div><b>9</b><p class="text-label-sm text-on-surface-variant">持有</p></div><div><b class="negative">3</b><p class="text-label-sm text-on-surface-variant">卖出</p></div></div></aside></div><div class="grid grid-cols-12 gap-gutter"><section class="col-span-12 lg:col-span-8 space-y-md">${events.map((e) => `<article class="card p-lg"><div class="flex justify-between gap-md"><div><span class="px-sm py-base bg-surface-container rounded-lg font-data-mono text-primary">${e[0]}</span><h3 class="font-headline-md mt-md">${e[1]}</h3><p class="text-on-surface-variant mt-sm leading-relaxed">${e[2]}</p></div><div class="text-right shrink-0"><span class="material-symbols-outlined text-secondary icon-fill">auto_awesome</span><p class="font-data-mono font-bold text-secondary mt-sm">${e[3]}</p></div></div></article>`).join("")}</section><aside class="col-span-12 lg:col-span-4 card p-lg"><h2 class="font-headline-md mb-lg">板块 IV 概览</h2>${[
    ["半导体", 82, "#ba1a1a"],
    ["软件基础设施", 61, "#2a14b4"],
    ["消费电子", 48, "#4338ca"],
    ["能源", 35, "#006c49"],
  ]
    .map(
      (x) =>
        `<div class="mb-md"><div class="flex justify-between text-label-sm mb-xs"><span>${x[0]}</span><b>${x[1]}%</b></div><div class="h-2 bg-surface-container rounded-full"><div class="h-full rounded-full" style="width:${x[1]}%;background:${x[2]}"></div></div></div>`,
    )
    .join("")}</aside></div></div>`;
}
