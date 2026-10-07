import images from './generated/gameImages.json';
import { iconFileUrl, isIconMapConfigured } from './iconMap';

/**
 * 아이템 그림 밖의 게임 그림(스킬 아이콘, 오검 워드). 그림은 사이트에 두지 않고 그림 서버(R2)에 있다.
 * 번호 -> 파일 이름 표는 scripts/game-data/upload-game-images.mjs 가 적는다. 파일 이름이 내용 해시라
 * 한 번 받으면 오래 붙잡는다.
 *
 * 표에 없거나 그림 서버가 없는 빌드면 빈 문자열이다. 화면은 그림 없이 그린다.
 */

const skills: Record<string, string> = images.skills;
const ogham: Record<string, string> = images.ogham;

function urlOf(file: string | undefined): string {
  return file && isIconMapConfigured() ? iconFileUrl(file) : '';
}

/** 스킬 그림(42px). */
export function skillImageUrl(skillId: number): string {
  return urlOf(skills[String(skillId)]);
}

/** 오검 워드 그림(64px 투명 바탕). 번호는 게임의 워드 번호와 같다. */
export function oghamWordImageUrl(wordId: number): string {
  return urlOf(ogham[String(wordId)]);
}
