import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BugOutlined, MessageOutlined } from '@ant-design/icons';
import { Alert, App, Button, FloatButton, Form, Input, Modal, Radio, Typography } from 'antd';
import { canReportIssue, submitIssueReport, type IssueCategory } from '@/features/report/api';

const { Text, Link: AntLink } = Typography;

interface FormValues {
  category: IssueCategory;
  title: string;
  body: string;
}

const INITIAL_VALUES: FormValues = {
  category: 'bug',
  title: '',
  body: '',
};

/** 무엇을 써야 할지 모르면 아무도 쓰지 않는다. 빈 칸에 틀을 깔아 준다. */
const BODY_PLACEHOLDER = `무엇이 어떻게 되었는지 적어 주세요.

버그라면 이런 것이 있으면 고치기 쉽습니다.
1. 어디서: 경매장 조회 화면
2. 무엇을 했는지: 카테고리를 검으로 두고 검색
3. 기대한 결과: 매물 목록
4. 실제 결과: 아무것도 나오지 않음`;

/**
 * 오른쪽 아래 이슈 제보 버튼.
 *
 * 방문자 대부분은 GitHub 계정이 없다. 그래서 여기서 쓴 글을 워커가 대신 이슈로
 * 올린다. 토큰은 워커에만 있고 브라우저로 내려가지 않는다.
 */
export function IssueReportButton() {
  const location = useLocation();
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');

  // 제보를 받을 곳이 없으면 버튼을 띄우지 않는다. 눌러도 안 되는 버튼은 없느니만 못하다.
  if (!canReportIssue()) return null;

  function close() {
    if (sending) return;
    setOpen(false);
    setFailure('');
    form.resetFields();
  }

  async function handleSubmit(values: FormValues) {
    setSending(true);
    setFailure('');

    try {
      const issue = await submitIssueReport({
        category: values.category,
        title: values.title.trim(),
        body: values.body.trim(),
        page: `${location.pathname}${location.search}`,
      });

      setOpen(false);
      form.resetFields();
      message.success(
        <span>
          제보가 올라갔습니다.{' '}
          <AntLink href={issue.url} target="_blank" rel="noreferrer">
            {`#${issue.number} 보기`}
          </AntLink>
        </span>,
        6,
      );
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : '제보를 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <FloatButton
        icon={<MessageOutlined />}
        tooltip="이슈 제보"
        aria-label="이슈 제보하기"
        onClick={() => setOpen(true)}
      />

      <Modal
        open={open}
        onCancel={close}
        title="이슈 제보"
        maskClosable={!sending}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={close} disabled={sending}>
            닫기
          </Button>,
          <Button key="submit" type="primary" loading={sending} onClick={() => form.submit()}>
            제보 보내기
          </Button>,
        ]}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={INITIAL_VALUES}
          onFinish={handleSubmit}
          disabled={sending}
          requiredMark={false}
        >
          <Text type="secondary" style={{ fontSize: 13 }}>
            보내면 이 프로젝트의 GitHub 저장소에 공개 이슈로 등록됩니다. 개인정보나 계정 정보는 적지 마세요.
          </Text>

          <Form.Item name="category" label="분류" style={{ marginTop: 16 }}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'bug', label: '버그' },
                { value: 'feature', label: '기능 추가 요청' },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="title"
            label="제목"
            rules={[
              { required: true, message: '제목을 적어 주세요.' },
              { min: 4, message: '제목은 4자 이상으로 적어 주세요.' },
              { max: 120, message: '제목은 120자까지 쓸 수 있습니다.' },
            ]}
          >
            <Input placeholder="예: 경매장에서 카테고리를 바꿔도 결과가 그대로입니다" maxLength={120} showCount />
          </Form.Item>

          {/*
            showCount 는 칸의 오른쪽 아래에 겹쳐 그려진다. 같은 자리에 extra 를 두면
            글자가 서로 포개진다. 안내는 placeholder 가 이미 틀까지 보여 주므로 비운다.
          */}
          <Form.Item
            name="body"
            label="내용"
            rules={[
              { required: true, message: '내용을 적어 주세요.' },
              { min: 10, message: '내용은 10자 이상으로 적어 주세요.' },
              { max: 4000, message: '내용은 4000자까지 쓸 수 있습니다.' },
            ]}
          >
            <Input.TextArea rows={8} placeholder={BODY_PLACEHOLDER} maxLength={4000} showCount />
          </Form.Item>

          {failure ? (
            <Alert
              type="error"
              showIcon
              icon={<BugOutlined />}
              message="제보를 보내지 못했습니다"
              description={failure}
            />
          ) : null}
        </Form>
      </Modal>
    </>
  );
}
