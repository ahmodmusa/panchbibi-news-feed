declare module 'google-news-url-decoder' {
  export interface DecodeResult {
    status: boolean;
    decoded_url?: string;
    message?: string;
  }

  export class GoogleDecoder {
    constructor();
    decode(url: string): Promise<DecodeResult>;
  }
}
