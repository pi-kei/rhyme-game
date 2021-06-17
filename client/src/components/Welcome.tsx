import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Container, Grid, Header, Icon, Input, InputProps } from 'semantic-ui-react';
import LangSelector from './LangSelector';
import './Welcome.css';

function Welcome() {
    const { t, ready } = useTranslation();
    const [gameId, setGameId] = useState<string>('');

    const onGameIdChange = (event: React.SyntheticEvent, data: InputProps) => {
        let newGameId = data.value.trim();
        const protocol = window.location.protocol;
        const host = window.location.host.replaceAll(/\./g, '\\.');
        const re = new RegExp(`^((((${protocol})?//)?${host})?/game/)?([0-9a-z-.]+)`);
        const match = newGameId.match(re);
        if (match) {
            setGameId(match[5]);
        } else {
            setGameId('');
        }
    };
    
    if (!ready) {
        return null;
    }

    return (
        <Container>
            <Grid padded>
                <Grid.Row>
                    <Grid.Column>
                        <Header as='h1'>
                            <Header.Content>
                                {t('appTitle')}
                                <Header.Subheader>{t('appDescription')}</Header.Subheader>
                            </Header.Content>
                        </Header>
                        <Grid>
                            <Grid.Row>
                                <Grid.Column>
                                    <LangSelector/>
                                </Grid.Column>
                            </Grid.Row>
                            <Grid.Row>
                                <Grid.Column>
                                    <Button as={Link} to='/game' primary>
                                        <Icon name='plus' />
                                        {t('welcomeStartButton')}
                                    </Button>
                                    <span className="or-divider">{t('welcomeOrDivider')}</span>
                                    <Input
                                        placeholder={t('welcomeGameIdInput')}
                                        action={{
                                            icon:'arrow right',
                                            as: Link,
                                            to: `/game/${gameId}`,
                                            primary: true,
                                            disabled: !gameId
                                        }}
                                        onChange={onGameIdChange}
                                        value={gameId}
                                    />
                                </Grid.Column>
                            </Grid.Row>
                        </Grid>
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column>
                        <span>
                            <Trans i18nKey='gitubLink' components={{linkToGithub:<a href="https://github.com/pi-kei/rhyme-game"/>}}/>
                        </span>
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        </Container>
    );
}

export default Welcome;