// The nocobase/nocobase3 commit source-baseline.yml verifies when no other is
// requested: the workflow_dispatch input default, which a workflow cannot read
// from a file, repeats it and a test keeps the two equal.
// Published @nocobase/app-template-default@1.0.0-beta.47 release commit.
export const SOURCE_BASELINE_DEFAULT = '28c7522b3ddb384b05745715e94f7f985d09a67e';
// Reserved immutable branches created by the verified source publisher.
export const isSourceBaselineRef = value => /^factory-baseline\/source-[a-f0-9]{12}-[1-9]\d*-[1-9]\d*$/u.test(value ?? '');
export const isSharedTaskBase = (value, defaultBranch) => value === defaultBranch || isSourceBaselineRef(value);
