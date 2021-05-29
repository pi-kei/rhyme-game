import { Link } from 'react-router-dom';
import { Button, Container, Header, Icon } from 'semantic-ui-react';

function Welcome() {
    return (
        <Container>
            <Header as='h1' content='Rhyme-Game' />
            <Button as={Link} to='/game'>
                Start
                <Icon name='arrow right' />
            </Button>
        </Container>
    );
}

export default Welcome;