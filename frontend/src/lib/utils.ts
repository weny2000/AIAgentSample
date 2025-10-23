import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * メールアドレスを部分的にマスクする
 * 例: test@example.com -> t***@e******.com
 */
export function maskEmail(email: string): string {
  if (!email) return '';

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;

  if (localPart.length <= 1) return email;

  // ローカル部分のマスク化
  const maskedLocal = localPart[0] + '*'.repeat(localPart.length - 1);

  // ドメイン部分のマスク化
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return email; // 不正なドメイン形式

  const maskedDomainParts = domainParts.map((part, index) => {
    if (index === domainParts.length - 1) {
      // 最後の部分（TLD）はそのまま表示
      return part;
    } else if (part.length <= 1) {
      // 1文字の場合はそのまま
      return part;
    } else {
      // 最初の文字 + アスタリスク
      return part[0] + '*'.repeat(part.length - 1);
    }
  });

  const maskedDomain = maskedDomainParts.join('.');
  return `${maskedLocal}@${maskedDomain}`;
}
