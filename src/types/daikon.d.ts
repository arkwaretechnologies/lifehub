declare module "daikon" {
  // Minimal typings for server-side DICOM decode.
  export const Series: {
    parseImage: (data: DataView) => DicomImage | null;
  };

  export const Image: {
    BYTE_TYPE_RGB: number;
  };

  export type DicomImage = {
    getCols: () => number;
    getRows: () => number;
    getNumberOfSamplesPerPixel: () => number;
    getDataType: () => number;
    getRawData: () => ArrayBuffer;
    getWindowCenter: () => number | null;
    getWindowWidth: () => number | null;
    getInterpretedData: (
      asArray: boolean,
      asObject: boolean,
      frameIndex: number,
    ) => {
      data: Float32Array;
      min: number;
      max: number;
      numCols: number;
      numRows: number;
    };
  };
}
