import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SIGNED_URL_TTL_SECONDS = 15 * 60;

/** Operações genéricas de objetos. A escolha do bucket pertence ao chamador. */
@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.client = new S3Client({
      region: config.get<string>('storage.awsRegion', 'sa-east-1'),
    });
  }

  async upload(params: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: params.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
          ServerSideEncryption: 'AES256',
        }),
      );
    } catch (error) {
      this.throwUnavailable('upload', error);
    }
  }

  async delete(bucket: string, key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error) {
      this.throwUnavailable('delete', error);
    }
  }

  async getSignedDownloadUrl(bucket: string, key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: SIGNED_URL_TTL_SECONDS },
      );
    } catch (error) {
      this.throwUnavailable('sign-download', error);
    }
  }

  private throwUnavailable(operation: string, error: unknown): never {
    this.logger.error(
      `Falha S3 em ${operation}: ${storageErrorSummary(error)}.`,
    );
    throw new ServiceUnavailableException(
      'O armazenamento de documentos está temporariamente indisponível.',
    );
  }
}

function storageErrorSummary(error: unknown): string {
  if (!error || typeof error !== 'object') return 'UnknownError';
  const value = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  const name = typeof value.name === 'string' ? value.name : 'UnknownError';
  const status = value.$metadata?.httpStatusCode;
  return typeof status === 'number' ? `${name} (HTTP ${status})` : name;
}
