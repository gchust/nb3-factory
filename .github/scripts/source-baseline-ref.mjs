// Reserved immutable branches created by the verified source publisher.
export const isSourceBaselineRef = value => /^factory-baseline\/source-[a-f0-9]{12}-[1-9]\d*-[1-9]\d*$/u.test(value ?? '');
export const isSharedTaskBase = (value, defaultBranch) => value === defaultBranch || isSourceBaselineRef(value);
