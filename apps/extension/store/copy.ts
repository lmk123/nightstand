// Text drawn into the Chrome Web Store images, per store locale. The store
// listing itself (description, privacy answers) is in the .md files next to
// this one. Unlike the manifest, store pages say plainly what Nightstand does:
// the store's policies require it.

export const LOCALES = ['en', 'zh_CN', 'zh_TW'] as const
export type Locale = (typeof LOCALES)[number]

export type ShotName = 'decoy' | 'vault' | 'cover' | 'form' | 'notice'

export interface Caption {
  /** `\n` marks a line break (Chinese has no spaces to balance lines on). */
  title: string
  body: string
}

export interface Site {
  host: string
  title: string
  emoji: string
}

interface Copy {
  tagline: string
  /** Store screenshots, in the order they are uploaded. The store takes at most 5 per locale. */
  shots: [ShotName, Caption][]
  /** Quick Links shown while locked. */
  links: Site[]
  /** Saved sites in the encrypted list. */
  saved: Site[]
}

export const COPY: Record<Locale, Copy> = {
  en: {
    tagline: 'Make your address bar forget certain sites',
    shots: [
      [
        'decoy',
        {
          title: 'Looks like an ordinary Quick Links launcher',
          body: "Click the icon and that's all anyone sees. Type your passphrase into the filter box and press Enter to unlock."
        }
      ],
      [
        'vault',
        {
          title: 'Your sites, in an encrypted list',
          body: 'Their browsing history is deleted after every visit, so the address bar stops suggesting them.'
        }
      ],
      [
        'cover',
        {
          title: 'Covered until you choose to show it',
          body: "Turn on enhanced mode, and a saved site opens covered and muted, under a plain tab title. Move the mouse off it, switch tabs or leave it for a minute, and it's covered again."
        }
      ],
      [
        'notice',
        {
          title: 'See what goes before you save',
          body: "Saving a site deletes the history and bookmarks it already has. Nightstand shows you how many first."
        }
      ],
      [
        'form',
        {
          title: 'A whole site, or just one page',
          body: 'Clean up a site with all its subdomains, or a single URL — plus the other domains a site sends you to.'
        }
      ]
    ],
    links: [
      {host: 'news.example', title: 'News', emoji: '📰'},
      {host: 'weather.example', title: 'Weather', emoji: '⛅'},
      {host: 'calendar.example', title: 'Calendar', emoji: '📅'},
      {host: 'mail.example', title: 'Mail', emoji: '✉️'},
      {host: 'docs.example', title: 'Docs', emoji: '📝'},
      {host: 'maps.example', title: 'Maps', emoji: '🗺️'},
      {host: 'translate.example', title: 'Translate', emoji: '🌐'},
      {host: 'music.example', title: 'Music', emoji: '🎧'}
    ],
    saved: [
      {host: 'gifts.example', title: 'Birthday gift ideas for Mom', emoji: '🎁'},
      {host: 'homes.example', title: 'Apartment listings', emoji: '🏠'},
      {host: 'party.example', title: 'Surprise party planning', emoji: '🎉'},
      {host: 'clinic.example', title: 'Health checkup results', emoji: '🩺'},
      {host: 'rings.example', title: 'Engagement rings', emoji: '💍'},
      {host: 'jobs.example', title: 'Job openings', emoji: '💼'}
    ]
  },
  zh_CN: {
    tagline: '让地址栏忘掉某些网站',
    shots: [
      [
        'decoy',
        {
          title: '看起来只是一个\n普通的快捷链接工具',
          body: '别人点开图标，看到的就只有这些。在筛选框里输入口令、按回车，才会解锁。'
        }
      ],
      [
        'vault',
        {
          title: '你的网站，\n存在加密列表里',
          body: '每次访问后自动删除浏览记录，地址栏就不会再提示它们。'
        }
      ],
      [
        'cover',
        {
          title: '收藏的网站，\n先遮住再显示',
          body: '开启增强模式后，打开收藏的网站时页面被盖住、标签页静音，点“显示页面”才出现。鼠标移开、切换标签页或一分钟不操作，又会重新遮住。'
        }
      ],
      [
        'notice',
        {
          title: '保存之前，\n先看清要删除什么',
          body: '保存网站时会删除它已有的浏览记录和书签，Nightstand 会先告诉你有多少。'
        }
      ],
      [
        'form',
        {
          title: '整个站点，\n或者只是一个网址',
          body: '可以清理一个网站和它的所有子域名，也可以只清理一个网址；网站会跳去的其他域名也能一起清理。'
        }
      ]
    ],
    links: [
      {host: 'news.example', title: '新闻', emoji: '📰'},
      {host: 'weather.example', title: '天气', emoji: '⛅'},
      {host: 'calendar.example', title: '日历', emoji: '📅'},
      {host: 'mail.example', title: '邮箱', emoji: '✉️'},
      {host: 'docs.example', title: '文档', emoji: '📝'},
      {host: 'maps.example', title: '地图', emoji: '🗺️'},
      {host: 'translate.example', title: '翻译', emoji: '🌐'},
      {host: 'music.example', title: '音乐', emoji: '🎧'}
    ],
    saved: [
      {host: 'gifts.example', title: '给妈妈的生日礼物', emoji: '🎁'},
      {host: 'homes.example', title: '租房信息', emoji: '🏠'},
      {host: 'party.example', title: '惊喜派对筹备', emoji: '🎉'},
      {host: 'clinic.example', title: '体检报告', emoji: '🩺'},
      {host: 'rings.example', title: '求婚戒指', emoji: '💍'},
      {host: 'jobs.example', title: '招聘机会', emoji: '💼'}
    ]
  },
  zh_TW: {
    tagline: '讓網址列忘掉某些網站',
    shots: [
      [
        'decoy',
        {
          title: '看起來只是一個\n普通的快速連結工具',
          body: '別人點開圖示，看到的就只有這些。在篩選框裡輸入密語、按 Enter，才會解鎖。'
        }
      ],
      [
        'vault',
        {
          title: '你的網站，\n存在加密清單裡',
          body: '每次造訪後自動刪除瀏覽記錄，網址列就不會再建議它們。'
        }
      ],
      [
        'cover',
        {
          title: '收藏的網站，\n先遮住再顯示',
          body: '開啟增強模式後，打開收藏的網站時頁面會被蓋住、分頁靜音，按「顯示頁面」才會出現。滑鼠移開、切換分頁或一分鐘沒有操作，又會重新遮住。'
        }
      ],
      [
        'notice',
        {
          title: '儲存之前，\n先看清要刪除什麼',
          body: '儲存網站時會刪除它既有的瀏覽記錄和書籤，Nightstand 會先告訴你有多少。'
        }
      ],
      [
        'form',
        {
          title: '整個網站，\n或者只是一個網址',
          body: '可以清除一個網站和它的所有子網域，也可以只清除一個網址；網站會跳轉過去的其他網域也能一起清除。'
        }
      ]
    ],
    links: [
      {host: 'news.example', title: '新聞', emoji: '📰'},
      {host: 'weather.example', title: '天氣', emoji: '⛅'},
      {host: 'calendar.example', title: '日曆', emoji: '📅'},
      {host: 'mail.example', title: '郵件', emoji: '✉️'},
      {host: 'docs.example', title: '文件', emoji: '📝'},
      {host: 'maps.example', title: '地圖', emoji: '🗺️'},
      {host: 'translate.example', title: '翻譯', emoji: '🌐'},
      {host: 'music.example', title: '音樂', emoji: '🎧'}
    ],
    saved: [
      {host: 'gifts.example', title: '給媽媽的生日禮物', emoji: '🎁'},
      {host: 'homes.example', title: '租屋資訊', emoji: '🏠'},
      {host: 'party.example', title: '驚喜派對籌備', emoji: '🎉'},
      {host: 'clinic.example', title: '健康檢查報告', emoji: '🩺'},
      {host: 'rings.example', title: '求婚戒指', emoji: '💍'},
      {host: 'jobs.example', title: '職缺機會', emoji: '💼'}
    ]
  }
}
