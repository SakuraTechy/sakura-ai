/* Type declarations for theme.js */
declare const themeTokens: {
  colors: any;
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  typography: any;
};

declare const antdThemeConfig: any;
declare const darkThemeConfig: any;

export { themeTokens, antdThemeConfig, darkThemeConfig };
export type ThemeTokens = typeof themeTokens;