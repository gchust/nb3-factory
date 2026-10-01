/**
 * Byte-level fixtures for the project-materials demo.
 *
 * The bytes are embedded as base64 rather than shipped as files: only compiled task artifacts and
 * Collection metadata reach `dist/database`, so a binary dropped into `database/main/fixtures/`
 * would work in development and be missing after a build. A TypeScript module is compiled and
 * copied with the rest of the server, whichever way the application is run.
 *
 * This module deliberately lives outside `database/main/seeds/`. The seed loader treats every task
 * file directly in that directory as a seed that default-exports `defineSeed`, so a shared constant
 * parked there would be loaded as a seed and fail to run.
 */
export interface DemoFixture {
  readonly filename: string;
  readonly ext: string;
  readonly mimeType: string;
  readonly size: number;
  readonly base64: string;
}

/**
 * A 4x4 RGBA PNG, small enough to inline and valid enough for a browser to decode.
 */
export const DEMO_SITE_PHOTO: DemoFixture = {
  filename: 'site-photo.png',
  ext: 'png',
  mimeType: 'image/png',
  size: 75,
  base64:
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR42mO4o6HxHxkzkC4AAJiYIrF+8HwVAAAAAElFTkSuQmCC',
};

/**
 * A minimal but structurally valid OOXML word-processing document.
 */
export const DEMO_SITE_DOCUMENT: DemoFixture = {
  filename: 'site-document.docx',
  ext: 'docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  size: 1154,
  base64:
    'UEsDBBQAAAAIABC8Pl3IZt/Q7AAAAK8BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyW7CMBC98xWWryhx6KGqqiQcuhzbHugHjOxJYuFNHkPh7zsByqGiPc68Va9dH7wTe8xkY+jkqm6kwKCjsWHs5OfmtXqQggoEAy4G7OQRSa77Rbs5JiTB4kCdnEpJj0qRntAD1TFhYGSI2UPhM48qgd7CiOquae6VjqFgKFWZPWTfPuMAO1fEy4Hf5yIZHUnxdCbOWZ2ElJzVUBhX+2B+pVSXhJqVJw5NNtGSCVLdTJiRvwMuundeJluD4gNyeQPPLPUVs1Em6p1nZf2/zY2ecRisxqt+dks5aiTiyb2rr4gHG376q9Pc/eIbUEsDBAoAAAAAABC8Pl0AAAAAAAAAAAAAAAAGAAAAX3JlbHMvUEsDBBQAAAAIABC8Pl06SRuAsQAAACsBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuC9p4i807QMCKGmXRBSV1QOECVuGtE8lIRHb08GBooYGG3//iw33dPM5I4hamcZ1GUFBK1wUlvF4DKcNnsgMXEr+ewsMlgwQtcWzRlnnvJOnLSPJCM2MphS8gdKo5jQ8Fg6jzZPRhcMT7kMinourlwh3VbVjoZPA9qVSXrJIPSyBjIsHv+x3ThqgUcnbgZt+nHiK5FlHhQmBg8XJJXvdplZoG1DVy+2xQtQSwMECgAAAAAAELw+XQAAAAAAAAAAAAAAAAUAAAB3b3JkL1BLAwQUAAAACAAQvD5dZtBsIN8AAABVAQAAEQAAAHdvcmQvZG9jdW1lbnQueG1sbZBPT8MwDMXv+xRW7jSFA0JV2x1AXNlhSFyzxlszJXFkp3T99qSDCQlxeZb/6Pee3G4vwcMnsjiKnbqvagUYB7Iunjr1vn+9e1Ig2URrPEXs1IKitv2mnRtLwxQwZiiEKM3cqTHn1Ggtw4jBSEUJY9kdiYPJpeWTnoltYhpQpBgErx/q+lEH46LqC/JAdllrWoVXyf2O6YxDBnEZoYCQnfEgJiSPcMtQtXq9XZWvmv5i9qMTeHl7/oCju+SJEUo/CVo4LJBHhPTjc7MQsBjof7CUwx3r6+A7s/79R7/5AlBLAQIeAxQAAAAIABC8Pl3IZt/Q7AAAAK8BAAATAAAAAAAAAAEAAACkgQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAh4DCgAAAAAAELw+XQAAAAAAAAAAAAAAAAYAAAAAAAAAAAAQAO1BHQEAAF9yZWxzL1BLAQIeAxQAAAAIABC8Pl06SRuAsQAAACsBAAALAAAAAAAAAAEAAACkgUEBAABfcmVscy8ucmVsc1BLAQIeAwoAAAAAABC8Pl0AAAAAAAAAAAAAAAAFAAAAAAAAAAAAEADtQRsCAAB3b3JkL1BLAQIeAxQAAAAIABC8Pl1m0Gwg3wAAAFUBAAARAAAAAAAAAAEAAACkgT4CAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAABQAFACABAABMAwAAAAA=',
};

/**
 * A file that claims to be a PNG but carries none of the image data. It exists so the interface can
 * be verified to explain a broken preview instead of presenting the filename as a success.
 */
export const DEMO_CORRUPTED_PHOTO: DemoFixture = {
  filename: 'corrupted-photo.png',
  ext: 'png',
  mimeType: 'image/png',
  size: 152,
  base64:
    'iVBORw0KGgpUSElTLUlTLUEtQ09SUlVQVEVELVBORy1QQVlMT0FELU5PVC1BLVJFQUwtSU1BR0VUSElTLUlTLUEtQ09SUlVQVEVELVBORy1QQVlMT0FELU5PVC1BLVJFQUwtSU1BR0VUSElTLUlTLUEtQ09SUlVQVEVELVBORy1QQVlMT0FELU5PVC1BLVJFQUwtSU1BR0U=',
};

/**
 * The file rows the demo seed creates, in the order they are uploaded to a material.
 */
export const DEMO_FIXTURE_BY_KEY = {
  photo: DEMO_SITE_PHOTO,
  document: DEMO_SITE_DOCUMENT,
  corrupted: DEMO_CORRUPTED_PHOTO,
} as const;
