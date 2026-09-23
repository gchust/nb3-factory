// The same production renderer, with visibly fictional review data. No model call.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renderHtml } from './render-report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const facts = JSON.parse(await readFile(path.join(here, 'example.facts.json'), 'utf8'));
facts.buildReview = JSON.parse(await readFile(path.join(here, 'example.review.json'), 'utf8'));
facts.meta.title = 'NocoBase3 搭建评审 · 报告版式样例';
facts.meta.sampleNotice = '完全虚构的版式样例：所有评分、优点、错误和证据原文均为测试数据，不是对 NocoBase3 或某次真实搭建的评价。';
const result = await renderHtml(facts, null, here);
await writeFile(process.argv[2] || '/tmp/factory-review-example.html', result.html);
