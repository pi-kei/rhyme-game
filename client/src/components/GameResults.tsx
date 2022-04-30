import { nanoid } from "nanoid";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Container, Divider, Grid, Icon, Image, Ref, Segment } from "semantic-ui-react";
import saveImage from "../saveImage";
import { useSoundsHelper } from "../soundsHelper";
import { useAlertContext } from "./Alert";
import { PlayerInfo, soundsHelper, speechHelper } from "./Game";

interface GameResultsProps {
  resultsData: any;
  players: PlayerInfo[];
  hostId: string;
  selfId: string;
  muteTts: boolean;
  resultsRevealData: {
    currentPoetry: number;
    currentPoetryLine: number;
  };
  onRevealResult: (poetry: number, poetryLine: number) => void;
  onNewRound: () => void;
}

function GameResults({ resultsData, players, hostId, selfId, muteTts, resultsRevealData, onRevealResult, onNewRound }: GameResultsProps) {
  const { t, i18n } = useTranslation();
  const [poeties, setPoetries] = useState<any[]>([]);
  const { appendMessage } = useAlertContext();
  const poetryElementRef = useRef(null);
  const speechHelperRef = useRef(speechHelper);
  const { isMuted, toggleMuted } = useSoundsHelper(soundsHelper);
  const [maxResultsRevealData, setMaxResultsRevealData] = useState<{ currentPoetryLine: number; currentPoetry: number }>({ currentPoetryLine: -1, currentPoetry: -1 });
  const buttonsRef = useRef<HTMLDivElement>(null);

  const onRevealNextResult = () => {
    const { currentPoetryLine, currentPoetry } = resultsRevealData;

    if (maxResultsRevealData.currentPoetry >= currentPoetry + 1) {
      onRevealResult(currentPoetry + 1, maxResultsRevealData.currentPoetry === currentPoetry + 1 ? maxResultsRevealData.currentPoetryLine : poeties[currentPoetry + 1].length - 1);
    } else if (currentPoetry < 0 || (currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1)) {
      onRevealResult(currentPoetry + 1, -1);
    } else {
      onRevealResult(currentPoetry, currentPoetryLine + 1);
    }
  };

  const onRevealPrevResult = () => {
    const { currentPoetry } = resultsRevealData;
    if (currentPoetry > 0) {
      onRevealResult(currentPoetry - 1, poeties[currentPoetry - 1].length - 1);
    }
  };

  const onSave = () => {
    if (!poetryElementRef.current) {
      return;
    }

    const { currentPoetry } = resultsRevealData;

    saveImage(poeties[currentPoetry])
      .then((canvas) => {
        const uri = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.href = uri;
        link.download = `${currentPoetry + 1}-${nanoid()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      })
      .catch((error) => {
        appendMessage("Error", "Could not save image", "error");
        console.error(error);
      });
  };

  useEffect(() => {
    if (!resultsData) {
      setPoetries([]);
      return;
    }
    setPoetries(
      resultsData.order
        .map((pId: string) => {
          if (!resultsData.results[pId]) {
            return undefined;
          }
          return resultsData.results[pId].map((line: { author: string; input: string }) => {
            const author = players.find((p2) => p2.id === line.author);
            return {
              playerId: line.author,
              avatar: author?.avatar || "",
              name: author?.name || "???",
              text: line.input,
            };
          });
        })
        .filter((poetry: any[]) => poetry && poetry.length)
    );
  }, [resultsData, players]);

  useEffect(() => {
    speechHelperRef.current.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    speechHelperRef.current.muted = muteTts || isMuted;
  }, [muteTts, isMuted]);

  useEffect(() => {
    const { currentPoetryLine, currentPoetry } = resultsRevealData;

    if (currentPoetry > maxResultsRevealData.currentPoetry || (currentPoetry === maxResultsRevealData.currentPoetry && currentPoetryLine > maxResultsRevealData.currentPoetryLine)) {
      setMaxResultsRevealData({ currentPoetry, currentPoetryLine });
    }

    if (buttonsRef.current) {
      buttonsRef.current.scrollIntoView({ block: "end", behavior: "smooth" });
    }
  }, [resultsRevealData]);

  useEffect(() => {
    const { currentPoetryLine, currentPoetry } = maxResultsRevealData;

    if (currentPoetry >= 0 && currentPoetryLine >= 0 && poeties[currentPoetry] && poeties[currentPoetry][currentPoetryLine]) {
      speechHelperRef.current.speak(poeties[currentPoetry][currentPoetryLine].text);
    }
  }, [maxResultsRevealData]);

  const { currentPoetryLine, currentPoetry } = resultsRevealData;
  const isPoetryFullyRevealed = currentPoetry >= 0 && poeties[currentPoetry] && currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1;
  const isAllPoetriesRevealed = currentPoetry >= 0 && currentPoetry === poeties.length - 1 && currentPoetryLine >= 0 && currentPoetryLine === poeties[currentPoetry].length - 1;
  const isHost = selfId && hostId && selfId === hostId;

  return (
    <Container>
      <Grid padded>
        <Grid.Row columns={2}>
          <Grid.Column width={13}>
            {currentPoetry >= 0 && (
              <span>
                {currentPoetry + 1} / {poeties.length}
              </span>
            )}
            {currentPoetry >= 0 && poeties[currentPoetry] && (
              <>
                &nbsp;&nbsp;
                <small>
                  ({currentPoetryLine + 1} / {poeties[currentPoetry].length})
                </small>
              </>
            )}
          </Grid.Column>
          <Grid.Column width={3} textAlign="right">
            <Button icon={isMuted ? "volume off" : "volume up"} active={false} basic onClick={toggleMuted} />
          </Grid.Column>
        </Grid.Row>
        <Divider horizontal>∗ ∗ ∗</Divider>
        {currentPoetry >= 0 && poeties[currentPoetry] && (
          <>
            <Ref innerRef={poetryElementRef}>
              <Grid.Row>
                <Grid.Column>
                  {poeties[currentPoetry].map((line: { playerId: string; avatar: string; name: string; text: string }, index: number) => {
                    return (
                      <div className="poetry-line-block" key={`poetry-line-${line.playerId}`}>
                        {index <= currentPoetryLine + 1 ? (
                          <>
                            <div>
                              {line.avatar && <Image avatar src={line.avatar} />}
                              {line.name}:
                            </div>
                            <Segment className="poetry-line">{index <= currentPoetryLine ? line.text : "..."}</Segment>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </Grid.Column>
              </Grid.Row>
            </Ref>
            <Divider horizontal>∗ ∗ ∗</Divider>
          </>
        )}
        <Ref innerRef={buttonsRef}>
          <Grid.Row>
            <Grid.Column textAlign="center">
              {isHost && currentPoetry > 0 && (
                <Button primary onClick={onRevealPrevResult}>
                  <Icon name="arrow left" />
                  {t("gameResultsPrevButton")}
                </Button>
              )}
              {isPoetryFullyRevealed && (
                <Button primary onClick={onSave}>
                  <Icon name="photo" />
                  {t("gameResultsSaveButton")}
                </Button>
              )}
              {isHost && !isAllPoetriesRevealed && (
                <Button primary onClick={onRevealNextResult}>
                  {t("gameResultsNextButton")}
                  <Icon name="arrow right" />
                </Button>
              )}
              {isHost && isAllPoetriesRevealed && (
                <Button primary onClick={onNewRound}>
                  {t("gameResultsNewRoundButton")}
                  <Icon name="arrow right" />
                </Button>
              )}
            </Grid.Column>
          </Grid.Row>
        </Ref>
      </Grid>
    </Container>
  );
}

export default GameResults;
