import { SyntheticEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, CheckboxProps, Confirm, Container, Dropdown, DropdownProps, Form, Grid, Icon, Image, Segment } from "semantic-ui-react";
import { useSoundsHelper } from "../soundsHelper";
import { PlayerInfo, soundsHelper } from "./Game";

interface LobbyProps {
  players: PlayerInfo[];
  hostId: string;
  selfId: string;
  settings: any;
  onKick: (userId: string) => void;
  onSettingsUpdate: (settings: any) => void;
  onBack: () => void;
  onInvite: () => void;
  onStart: () => void;
}

function Lobby({ players, hostId, selfId, settings, onKick, onSettingsUpdate, onBack, onInvite, onStart }: LobbyProps) {
  const { t } = useTranslation();
  const [confirmKick, setConfirmKick] = useState<PlayerInfo | null>(null);
  const { isMuted, toggleMuted } = useSoundsHelper(soundsHelper);
  const onCancelKick = () => {
    setConfirmKick(null);
  };
  const onConfirmKick = () => {
    setConfirmKick(null);
    onKick(confirmKick!.id);
  };
  const onMaxPlayersChange = (event: SyntheticEvent, data: DropdownProps) => {
    onSettingsUpdate({
      ...settings,
      maxPlayers: data.value,
    });
  };
  const onShowFullPreviousLineChange = (event: SyntheticEvent, data: CheckboxProps) => {
    onSettingsUpdate({
      ...settings,
      showFullPreviousLine: data.checked,
    });
  };
  const onRevealLastWordInLinesChange = (event: SyntheticEvent, data: CheckboxProps) => {
    onSettingsUpdate({
      ...settings,
      revealLastWordInLines: data.checked,
    });
  };
  const onRevealAtMostPercentChange = (event: SyntheticEvent, data: DropdownProps) => {
    onSettingsUpdate({
      ...settings,
      revealAtMostPercent: data.value,
    });
  };
  const onStepDurationChange = (event: SyntheticEvent, data: DropdownProps) => {
    onSettingsUpdate({
      ...settings,
      stepDuration: data.value,
    });
  };
  const onTurnOnTtsChange = (event: SyntheticEvent, data: CheckboxProps) => {
    onSettingsUpdate({
      ...settings,
      turnOnTts: data.checked,
    });
  };
  const playersCount = useMemo(() => {
    return players.reduce((prevCount, player) => prevCount + (player.left ? 0 : 1), 0);
  }, [players]);
  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            <Button onClick={onBack} basic>
              <Icon name="arrow left" />
              {t("gameBackButton")}
            </Button>
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
      </Grid>
      <Grid columns={2} divided padded stackable>
        <Grid.Column width={5}>
          <div>
            {t("gamePlayersCountLabel")}: {playersCount} / {settings && settings.maxPlayers}
          </div>
          {players.map((p: PlayerInfo) => (
            <div key={p.id} className="ui-player-list-item" style={p.left ? { display: "none" } : undefined}>
              <Image avatar src={p.avatar} />
              <span className="ui-player-list-item-name">{p.name}</span>
              {(p.id === selfId || p.id === hostId) && (
                <Icon.Group size="big">
                  {p.id === hostId && <Icon name="certificate" color="yellow" />}
                  {p.id === selfId && <Icon name="check" color="green" />}
                </Icon.Group>
              )}
              {selfId && hostId && selfId === hostId && p.id !== selfId && <Button icon="ban" color="red" onClick={() => setConfirmKick(p)} compact circular />}
            </div>
          ))}
        </Grid.Column>
        <Grid.Column width={11}>
          <Grid>
            <Grid.Row>
              <Grid.Column>
                <Form>
                  <Form.Field inline>
                    <label>{t("gameSettingsMaxPlayers")}</label>
                    <Dropdown
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      options={[
                        { key: "2", value: 2, text: "2" },
                        { key: "3", value: 3, text: "3" },
                        { key: "4", value: 4, text: "4" },
                        { key: "5", value: 5, text: "5" },
                        { key: "6", value: 6, text: "6" },
                        { key: "7", value: 7, text: "7" },
                        { key: "8", value: 8, text: "8" },
                        { key: "9", value: 9, text: "9" },
                        { key: "10", value: 10, text: "10" },
                        { key: "11", value: 11, text: "11" },
                        { key: "12", value: 12, text: "12" },
                        { key: "13", value: 13, text: "13" },
                        { key: "14", value: 14, text: "14" },
                        { key: "15", value: 15, text: "15" },
                        { key: "16", value: 16, text: "16" },
                      ]}
                      value={settings && settings.maxPlayers}
                      onChange={onMaxPlayersChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsShowFullPreviousLine")}</label>
                    <Checkbox
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      toggle
                      className="settings-checkbox"
                      checked={settings && settings.showFullPreviousLine}
                      onChange={onShowFullPreviousLineChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsRevealLastWordInLines")}</label>
                    <Checkbox
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      toggle
                      className="settings-checkbox"
                      checked={settings && settings.revealLastWordInLines}
                      onChange={onRevealLastWordInLinesChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsRevealAtMostPercent")}</label>
                    <Dropdown
                      disabled={!settings || !settings.revealLastWordInLines || !(selfId && hostId && selfId === hostId)}
                      options={[
                        { key: "10", value: 10, text: "10%" },
                        { key: "15", value: 15, text: "15%" },
                        { key: "20", value: 20, text: "20%" },
                        { key: "25", value: 25, text: "25%" },
                        { key: "33", value: 33, text: "33%" },
                        { key: "50", value: 50, text: "50%" },
                      ]}
                      value={settings && settings.revealAtMostPercent}
                      onChange={onRevealAtMostPercentChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsStepDuration")}</label>
                    <Dropdown
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      options={[
                        { key: "30", value: 30000, text: `30 ${t("gameSettingsSeconds")}` },
                        { key: "45", value: 45000, text: `45 ${t("gameSettingsSeconds")}` },
                        { key: "60", value: 60000, text: `1 ${t("gameSettingsMinutes")}` },
                        { key: "90", value: 90000, text: `1.5 ${t("gameSettingsMinutes")}` },
                        { key: "120", value: 120000, text: `2 ${t("gameSettingsMinutes")}` },
                        { key: "180", value: 180000, text: `3 ${t("gameSettingsMinutes")}` },
                        { key: "300", value: 300000, text: `5 ${t("gameSettingsMinutes")}` },
                      ]}
                      value={settings && settings.stepDuration}
                      onChange={onStepDurationChange}
                    />
                  </Form.Field>
                  <Form.Field inline>
                    <label>{t("gameSettingsTurnOnTts")}</label>
                    <Checkbox
                      disabled={!settings || !(selfId && hostId && selfId === hostId)}
                      toggle
                      className="settings-checkbox"
                      checked={settings && settings.turnOnTts}
                      onChange={onTurnOnTtsChange}
                    />
                  </Form.Field>
                </Form>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column>
                <Button onClick={onInvite}>
                  <Icon name="chain" />
                  {t("gameInviteButton")}
                </Button>
                <Button disabled={!(selfId && hostId && selfId === hostId)} primary onClick={onStart}>
                  {t("gameStartButton")}
                  <Icon name="arrow right" />
                </Button>
              </Grid.Column>
            </Grid.Row>
          </Grid>
        </Grid.Column>
      </Grid>
      <Confirm
        open={!!confirmKick}
        onCancel={onCancelKick}
        onConfirm={onConfirmKick}
        cancelButton={t("confirmKickNoButton")}
        confirmButton={t("confirmKickYesButton")}
        header={t("confirmKickHeader")}
        content={
          confirmKick && (
            <Segment basic>
              <Image avatar src={confirmKick.avatar} />
              {confirmKick.name}
            </Segment>
          )
        }
      />
    </Container>
  );
}

export default Lobby;
