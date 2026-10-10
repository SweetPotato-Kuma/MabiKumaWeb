import { Card, Flex, Typography } from 'antd';

const { Title, Paragraph, Text, Link } = Typography;

/** 방침이 바뀌면 이 날짜를 고친다. 방문자가 언제 기준인지 알 수 있어야 한다. */
const EFFECTIVE_DATE = '2026년 10월 10일';

/**
 * 개인정보처리방침.
 *
 * 애드센스는 쿠키를 쓰므로 그 사실을 고지하는 페이지가 있어야 심사를 통과한다.
 * 적힌 내용은 실제 동작과 맞아야 한다. 저장하는 값이나 워커가 받는 값이 바뀌면 여기도 고친다.
 */
export function PrivacyPage() {
  return (
    <Flex vertical gap={16}>
      <Title level={3} style={{ margin: 0 }}>
        개인정보처리방침
      </Title>

      <Card>
        <Typography style={{ maxWidth: 720 }}>
          <Paragraph type="secondary">시행일 {EFFECTIVE_DATE}</Paragraph>

          <Paragraph>
            MabiKuma(mabi.spkuma.com)는 개인이 만든 비공식 마비노기 도구입니다. 로그인 없이 이용할
            수 있으며, 계정 저장을 원하는 경우 Google 인증 후 프로필을 등록할 수 있습니다. 아래는
            사이트를 쓰는 동안 다뤄지는 정보입니다.
          </Paragraph>

          <Title level={5}>브라우저에 저장하는 정보</Title>
          <Paragraph>
            화면 밝기 설정, 목표 아이템 재료 메모의 목표 아이템과 가진 재료 개수처럼 이 사이트의
            설정값과 입력값을 브라우저 저장소(localStorage)에 남깁니다. 비로그인 상태의 입력값은
            운영자에게 전송되지 않으며, 브라우저의 사이트 데이터를 지우면 함께 지워집니다.
            로그인하면 계정별 로컬 사본을 따로 보관하고 서버와 동기화합니다. 서버에 저장되기 전의
            변경은 브라우저 데이터를 지우면 손실될 수 있습니다.
          </Paragraph>

          <Title level={5}>선택적인 계정 저장</Title>
          <Paragraph>
            Google 인증을 선택하면 Google 인증 서비스와 통신합니다. 서버는 인증 정보를 확인하고
            Google 계정의 고유 식별자와 내부 계정 번호를 연결합니다. 인증 응답에 포함될 수 있는
            이름, 이메일, 프로필 사진은 계정 데이터로 저장하지 않으며 Google 비밀번호도 받지
            않습니다. 인증 토큰을 운영 로그에 남기지 않습니다.
          </Paragraph>
          <Paragraph>
            프로필 등록에 동의하면 입력한 닉네임과 동의 시점, 재료 메모·보유 수량·계산기의 기억
            입력값·저장 검색·관심 조건·개인 설정을 Cloudflare D1에 보관합니다. 이 값은 공개하지 않고
            인증된 해당 계정으로만 조회합니다. 사용자 입력은 운영 서버가 읽을 수 있는 형태로
            저장되므로 이름이나 연락처 같은 민감한 정보는 적지 마세요. API 키, 관리자 키와
            아이템·시세 조회 캐시는 계정 동기화 대상이 아닙니다.
          </Paragraph>
          <Paragraph>
            로그인 상태는 보안 쿠키로 유지하며 최대 30일 뒤 만료됩니다. 프로필 등록을 마치지 않은
            임시 계정은 7일 뒤 정리합니다. 등록한 계정 데이터는 사용자가 삭제할 때까지 보관하고 최근
            저장 내용 5개를 복구본으로 남깁니다. 계정 및 저장 화면에서 파일 내보내기와 계정 삭제를
            할 수 있습니다. 계정 삭제는 서버의 프로필·세션·저장 내용과 복구본 및 현재 브라우저의
            해당 계정 사본을 삭제합니다. 다른 기기의 로컬 사본이나 내려받은 파일은 그 기기에서
            별도로 지워야 합니다.
          </Paragraph>
          <Paragraph>
            삭제된 데이터가 Cloudflare 인프라 백업에 남는 기간은 서비스 요금제의 백업 보관 정책을
            따릅니다.
          </Paragraph>

          <Title level={5}>조회 요청</Title>
          <Paragraph>
            시세와 상점 조회는 운영자가 Cloudflare Workers에 둔 조회 서버를 거쳐 넥슨 오픈 API로
            전달됩니다. 짧은 시간에 요청이 몰리는 것을 막기 위해 요청의 IP 주소를 요청 제한에
            사용하며, Cloudflare가 서비스 운영 로그를 일정 기간 보관할 수 있습니다. 운영자는 이
            정보로 방문자를 식별하지 않습니다.
          </Paragraph>

          <Title level={5}>의견 보내기</Title>
          <Paragraph>
            의견 보내기로 보낸 제목과 내용, 보낸 화면의 주소는 이 사이트의 GitHub 저장소에 이슈로
            등록되어 누구나 볼 수 있습니다. 개인정보는 적지 마세요.
          </Paragraph>

          <Title level={5}>광고와 쿠키</Title>
          <Paragraph>
            이 사이트에는 Google AdSense 광고가 게재됩니다. Google을 비롯한 제3자 공급업체는 쿠키를
            사용해 방문자가 이 사이트나 다른 사이트를 방문한 기록을 바탕으로 광고를 게재합니다.
            Google은 광고 쿠키로 방문자에게 맞춤 광고를 보여 줄 수 있습니다.
          </Paragraph>
          <Paragraph>
            맞춤 광고는{' '}
            <Link href="https://adssettings.google.com" target="_blank" rel="noreferrer">
              Google 광고 설정
            </Link>
            에서 끌 수 있습니다. 제3자 공급업체의 쿠키는{' '}
            <Link href="https://www.aboutads.info/choices" target="_blank" rel="noreferrer">
              aboutads.info
            </Link>
            에서 거부할 수 있습니다. Google이 정보를 어떻게 쓰는지는{' '}
            <Link
              href="https://policies.google.com/technologies/partner-sites"
              target="_blank"
              rel="noreferrer"
            >
              Google 파트너 사이트 정책
            </Link>
            에서 확인할 수 있습니다.
          </Paragraph>

          <Title level={5}>문의</Title>
          <Paragraph>
            문의와 요청은 화면 위나 맨 아래의 <Text strong>의견 보내기</Text> 로 보내 주세요. 방침이
            바뀌면 이 페이지의 시행일을 고쳐 알립니다.
          </Paragraph>
        </Typography>
      </Card>
    </Flex>
  );
}
