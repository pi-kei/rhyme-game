import { Link } from 'react-router-dom';
import { Button, Container, Divider, Grid, Header, Icon } from 'semantic-ui-react';

function Welcome() {
    return (
        <Container>
            <Grid padded>
                <Grid.Row>
                    <Grid.Column>
                        <Header as='h1'>
                            <Header.Content>
                                {process.env.REACT_APP_TITLE}
                                <Header.Subheader>{process.env.REACT_APP_DESCRIPTION}</Header.Subheader>
                            </Header.Content>
                        </Header>
                        <Button as={Link} to='/game' primary>
                            Start
                            <Icon name='arrow right' />
                        </Button>
                    </Grid.Column>
                </Grid.Row>
                <Grid.Row>
                    <Grid.Column>
                        <span>Source code available on <a href="https://github.com/pi-kei/rhyme-game">GitHub</a></span>
                    </Grid.Column>
                </Grid.Row>
            </Grid>
        </Container>
    );
}

export default Welcome;