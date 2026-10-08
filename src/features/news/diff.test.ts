import { describe, expect, it } from 'vitest';
import { diffLines, diffRows, diffWords, htmlToLines } from './diff';

describe('본문을 글 줄로', () => {
  it('줄바꿈과 문단, 표 칸마다 줄을 나누고 빈 줄은 뺀다', () => {
    const html =
      '<div class="view_cont"><P>안녕하세요.<BR>마비노기입니다.<BR><BR></P><table><tr><td>기간</td><td>10/8</td></tr></table></div>';
    expect(htmlToLines(html)).toEqual(['안녕하세요.', '마비노기입니다.', '기간', '10/8']);
  });

  it('그림은 파일 이름으로 한 줄을 만든다', () => {
    expect(
      htmlToLines(
        '<p>위<img src="https://ssl.nexon.com/event/2026/bg.jpg?v=2" alt="이벤트">아래</p>',
      ),
    ).toEqual(['위', '[그림] bg.jpg', '아래']);
  });

  it('띄어쓰기와 &nbsp; 를 하나로 모은다', () => {
    expect(htmlToLines('<span>대표&nbsp;참여자</span>   <span>설정</span>')).toEqual([
      '대표 참여자 설정',
    ]);
  });
});

describe('판 비교', () => {
  it('바뀐 줄만 지움과 더함으로 가른다', () => {
    const before = ['안녕하세요.', '점검 시간: 06:00~11:00', '감사합니다.'];
    const after = ['안녕하세요.', '점검 시간: 06:00~11:30', '감사합니다.', '(내용 추가)'];
    expect(diffLines(before, after)).toEqual([
      { kind: 'same', text: '안녕하세요.' },
      { kind: 'del', text: '점검 시간: 06:00~11:00' },
      { kind: 'add', text: '점검 시간: 06:00~11:30' },
      { kind: 'same', text: '감사합니다.' },
      { kind: 'add', text: '(내용 추가)' },
    ]);
  });

  it('바뀐 줄 안에서는 바뀐 낱말만 칠한다', () => {
    expect(diffWords('점검 시간: 06:00~11:00 입니다', '점검 시간: 06:00~11:30 입니다')).toEqual({
      before: [
        { text: '점검 시간: ', changed: false },
        { text: '06:00~11:00', changed: true },
        { text: ' 입니다', changed: false },
      ],
      after: [
        { text: '점검 시간: ', changed: false },
        { text: '06:00~11:30', changed: true },
        { text: ' 입니다', changed: false },
      ],
    });
  });

  it('바뀐 곳에서 먼 같은 줄은 접는다', () => {
    const before = Array.from({ length: 10 }, (_, index) => `줄 ${index}`);
    const after = [...before];
    after[8] = '줄 8 고침';
    const rows = diffRows(diffLines(before, after), 1);
    expect(rows.map((row) => row.kind)).toEqual(['skip', 'same', 'del', 'add', 'same']);
    expect(rows[0]).toEqual({ kind: 'skip', count: 7 });
    expect(rows[3]).toMatchObject({
      kind: 'add',
      pieces: [
        { text: '줄 8', changed: false },
        { text: ' 고침', changed: true },
      ],
    });
  });

  it('수가 달라도 비슷한 줄끼리 짝지어 낱말로 칠하고, 짝이 없는 줄은 줄째로 칠한다', () => {
    const rows = diffRows(
      diffLines(['점검 시간: 06:00~11:00'], ['점검 시간: 06:00~11:30', '(내용 추가) 보상 안내']),
    );
    expect(rows).toEqual([
      {
        kind: 'del',
        text: '점검 시간: 06:00~11:00',
        pieces: [
          { text: '점검 시간: ', changed: false },
          { text: '06:00~11:00', changed: true },
        ],
      },
      {
        kind: 'add',
        text: '점검 시간: 06:00~11:30',
        pieces: [
          { text: '점검 시간: ', changed: false },
          { text: '06:00~11:30', changed: true },
        ],
      },
      { kind: 'add', text: '(내용 추가) 보상 안내' },
    ]);
  });

  it('비슷한 줄이 없으면 줄째로만 칠한다', () => {
    const rows = diffRows(diffLines(['가', '나'], ['다']));
    expect(rows).toEqual([
      { kind: 'del', text: '가' },
      { kind: 'del', text: '나' },
      { kind: 'add', text: '다' },
    ]);
  });
});
