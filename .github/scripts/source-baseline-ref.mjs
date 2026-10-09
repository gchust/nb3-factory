// The nocobase/nocobase commit source-baseline.yml verifies when no other is
// requested: the workflow_dispatch input default, which a workflow cannot read
// from a file, repeats it and a test keeps the two equal.
// Pinned v3-develop commit, resolved on 2026-10-10.
export const SOURCE_BASELINE_DEFAULT = 'ebcef43801270a1f72e2578ff9045bbe73c7d223';
// Reserved immutable branches created by the verified source publisher.
export const isSourceBaselineRef = value => /^factory-baseline\/source-[a-f0-9]{12}-[1-9]\d*-[1-9]\d*$/u.test(value ?? '');
export const isSharedTaskBase = (value, defaultBranch) => value === defaultBranch || isSourceBaselineRef(value);
