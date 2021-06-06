import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Container, Divider, Grid, Header, Icon } from 'semantic-ui-react';
import LangSelector from './LangSelector';

function Welcome() {
    const { t, ready } = useTranslation();
    
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
                        <LangSelector/>
                        <Button as={Link} to='/game' primary>
                            {t('welcomeStartButton')}
                            <Icon name='arrow right' />
                        </Button>
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