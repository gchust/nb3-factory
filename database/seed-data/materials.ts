/**
 * The materials the assistant may answer from — the sample content this application is built around.
 *
 * Only `title` and `body` are maintained. `restricted` is a permission fact, not a content field: the supervisor's
 * permission set reads every record, the colleague's only the unrestricted ones.
 */
export interface MaterialSeed {
  readonly title: string;
  readonly body: string;
  readonly restricted: boolean;
}

export const materialsSeed: readonly MaterialSeed[] = [
  {
    title: '设备报修电话',
    body: '蓝鹭设备报修电话为 400-000-7316。',
    restricted: false,
  },
  {
    title: '巡检要求',
    body: '蓝鹭设备常规巡检间隔为 45 天。',
    restricted: false,
  },
  {
    title: '保密项目代号',
    body: '保密项目的内部代号为墨竹 729。',
    restricted: true,
  },
];
