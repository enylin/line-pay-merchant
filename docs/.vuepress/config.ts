import { defineUserConfig } from 'vuepress'
import type { DefaultThemeOptions } from 'vuepress'

export default defineUserConfig<DefaultThemeOptions>({
  // site config
  base: '/line-pay-merchant/',
  lang: 'en-US',
  title: 'LINE Pay Merchant',
  description: 'LINE Pay V3 Online APIs library for Node.js',

  // theme and its config
  theme: '@vuepress/theme-default',
  themeConfig: {
    navbar: [
      {
        text: 'Home',
        link: '/'
      },
      {
        text: 'Guide',
        link: '/guide/getting-started'
      },
      {
        text: 'API Reference',
        link: '/api-reference/request'
      },
      {
        text: 'Resources',
        children: [
          {
            text: 'Official Online API V3 Guide',
            link: 'https://pay.line.me/tw/developers/apis/onlineApis?locale=en_US'
          }
        ]
      },
      {
        text: 'GitHub',
        link: 'https://github.com/enylin/line-pay-merchant'
      }
    ],
    sidebar: {
      '/': [],
      '/guide/': [
        {
          text: 'Guide',
          children: ['/guide/getting-started.md']
        }
      ],
      '/api-reference/': [
        {
          text: 'Reference',
          children: ['/api-reference/request.md']
        }
      ]
    }
  }
})
