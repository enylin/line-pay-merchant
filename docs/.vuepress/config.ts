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
    logo: 'https://vuejs.org/images/logo.png'
  }
})