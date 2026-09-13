import { describe, expect, it } from 'vitest';

import enUS from '../../client/locales/en-US.js';
import zhCN from '../../client/locales/zh-CN.js';

describe('announcements translations', () => {
  it('offers real English and Chinese wording', () => {
    expect(enUS.navigation.announcements).toBe('Announcements');
    expect(zhCN.navigation.announcements).toBe('公告');

    expect(enUS.announcements.form.submit).toBe('Publish');
    expect(zhCN.announcements.form.submit).toBe('发布');

    expect(enUS.announcements.error.titleRequired).toBe('Enter a title.');
    expect(zhCN.announcements.error.titleRequired).toBe('请输入标题。');
  });

  it('does not fall back to English for the Chinese empty state', () => {
    expect(zhCN.announcements.list.empty).toBe('暂无公告，发布第一条吧。');
    expect(zhCN.announcements.list.empty).not.toBe(
      enUS.announcements.list.empty,
    );
  });
});
