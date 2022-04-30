import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Container, Grid, Header, Input, InputOnChangeData, Progress, Transition } from "semantic-ui-react";
import { useSoundsHelper } from "../soundsHelper";
import { soundsHelper } from "./Game";
import { useCountdownTimer } from "./Timer";

interface GameStepsProps {
  settings: any;
  stepData: any;
  readyState?: { ready: number; total: number };
  onInput: (step: number, input: string, ready: boolean) => void;
}

function GameSteps({ settings, stepData, readyState, onInput }: GameStepsProps) {
  const { t } = useTranslation();
  const [timerState, timerReset] = useCountdownTimer(0, false);
  const [sent, setSent] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const { isMuted, toggleMuted, playSound } = useSoundsHelper(soundsHelper);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputRegexp = useMemo(() => {
    return new RegExp(`[^${settings?.lang === "ru" ? "а-яё" : "a-z"}\\p{Zs}\\p{P}]`, "giu");
  }, [settings?.lang]);

  const onButtonClick = () => {
    if (!input && !sent) {
      return;
    }
    const newSent = !sent;
    setSent(newSent);
    onInput(stepData.step, input, newSent);
  };

  const onInputChange = (event: React.ChangeEvent, data: InputOnChangeData) => {
    const newInput = data.value.replaceAll(inputRegexp, "");
    setInput(newInput);
    onInput(stepData.step, newInput, sent);
  };

  const onInputKeyPress = (event: React.KeyboardEvent) => {
    if (event.code !== "Enter") {
      return;
    }
    if (!input && !sent) {
      return;
    }
    const newSent = !sent;
    setSent(newSent);
    onInput(stepData.step, input, newSent);
  };

  useEffect(() => {
    setSent(false);
    setInput(stepData?.input ?? "");
    if (stepData) {
      timerReset(stepData.timeout);
    }
    if (stepData && stepData.step > 0) {
      playSound("step");
    }
  }, [stepData?.step]);

  useEffect(() => {
    if (!sent) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [stepData?.step, sent]);

  if (!stepData) {
    return null;
  }

  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            <span>
              {stepData.step} / {stepData.last}
            </span>
            {stepData && stepData.step > 0 && readyState && (
              <>
                &nbsp;&nbsp;
                <small>
                  ({readyState.ready} / {readyState.total})
                </small>
              </>
            )}
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
      </Grid>
      <Grid padded stackable>
        <Grid.Row>
          <Grid.Column>
            <Progress total={timerState.duration} value={timerState.passed} size="tiny" />
          </Grid.Column>
        </Grid.Row>
        {stepData && stepData.step === 0 && stepData.active && (
          <Grid.Row textAlign="center">
            <Grid.Column>
              <Transition animation="tada" duration={1000} transitionOnMount={true}>
                <Header as="h1">
                  <Header.Content>{t("gameStepsGetReady")}</Header.Content>
                </Header>
              </Transition>
            </Grid.Column>
          </Grid.Row>
        )}
        {stepData && stepData.lines && (
          <Grid.Row>
            <Grid.Column>
              {stepData.lines.map((line: string) => (
                <>
                  {line}
                  <br />
                </>
              ))}
            </Grid.Column>
          </Grid.Row>
        )}
        {stepData && stepData.step > 0 && stepData.active && (
          <Grid.Row columns={2}>
            <Grid.Column width={13}>
              <Input
                disabled={sent}
                fluid
                onChange={onInputChange}
                onKeyPress={onInputKeyPress}
                value={input}
                maxLength={100}
                placeholder={t(stepData.step === 1 ? "gameStepsFirstLine" : "gameStepsContinue")}
                tabIndex={-1}
              >
                <input ref={inputRef} />
              </Input>
            </Grid.Column>
            <Grid.Column width={3}>
              <Button primary fluid icon={sent ? "edit" : "send"} content={t(sent ? "gameStepsEditButton" : "gameStepsSendButton")} onClick={onButtonClick} />
            </Grid.Column>
          </Grid.Row>
        )}
      </Grid>
    </Container>
  );
}

export default GameSteps;
