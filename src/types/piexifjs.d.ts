declare module 'piexifjs' {
  const piexif: {
    dump(exifObj: unknown): string;
    insert(exifBytes: string, jpegData: string): string;
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    GPSIFD: Record<string, number>;
  };
  export default piexif;
}
