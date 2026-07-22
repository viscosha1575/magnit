// Chakra Imports
import { Box, Flex, Link, Text, useColorModeValue } from '@chakra-ui/react';
import PropTypes from 'prop-types';
import React, { useState, useEffect } from 'react';
import AdminNavbarLinks from 'components/navbar/NavbarLinksAdmin';

export default function AdminNavbar(props) {
	const [ scrolled, setScrolled ] = useState(false);
	const mobileSafeTop = 'var(--admin-safe-area-top, 0px)';

	useEffect(() => {
		window.addEventListener('scroll', changeNavbar);

		return () => {
			window.removeEventListener('scroll', changeNavbar);
		};
	}, []);

	const { secondary, message, brandText } = props;

	// Here are all the props that may change depending on navbar's type or state.(secondary, variant, scrolled)
	let mainText = useColorModeValue('navy.700', 'white');
	let secondaryText = useColorModeValue('gray.700', 'white');
	let navbarPosition = 'fixed';
	let navbarFilter = 'none';
	let navbarBackdrop = 'blur(20px)';
	let navbarShadow = 'none';
	let navbarBg = useColorModeValue('rgba(244, 247, 254, 0.2)', 'rgba(11,20,55,0.5)');
	let navbarBorder = 'transparent';
	let secondaryMargin = '0px';
	let paddingX = '15px';
	let gap = '0px';
	const changeNavbar = () => {
		if (window.scrollY > 1) {
			setScrolled(true);
		} else {
			setScrolled(false);
		}
	};

	return (
		<>
			<Box
				display={{ base: 'block', md: 'none' }}
				position='fixed'
				top={`calc(${mobileSafeTop} + 20px)`}
				right='8px'
				zIndex='1200'>
				<AdminNavbarLinks
					onOpen={props.onOpen}
					logoText={props.logoText}
					secondary={props.secondary}
					fixed={props.fixed}
					scrolled={scrolled}
				/>
			</Box>

			<Box
				display={{ base: 'none', md: secondary ? 'block' : 'flex' }}
				position={navbarPosition}
				boxShadow={navbarShadow}
				bg={navbarBg}
				borderColor={navbarBorder}
				filter={navbarFilter}
				backdropFilter={navbarBackdrop}
				backgroundPosition='center'
				backgroundSize='cover'
				borderRadius='16px'
				borderWidth='1.5px'
				borderStyle='solid'
				transitionDelay='0s, 0s, 0s, 0s'
				transitionDuration=' 0.25s, 0.25s, 0.25s, 0s'
				transition-property='box-shadow, background-color, filter, border'
				transitionTimingFunction='linear, linear, linear, linear'
				alignItems={{ xl: 'center' }}
				minH='75px'
				justifyContent={{ xl: 'center' }}
				lineHeight='25.6px'
				mx='auto'
				mt={secondaryMargin}
				pb='8px'
				right={{ md: '20px', lg: '24px', xl: '30px' }}
				px={{
					sm: paddingX,
					md: '10px'
				}}
				ps={{
					xl: '12px'
				}}
				pt='8px'
				top={{ md: '16px', lg: '20px', xl: '20px' }}
				w={{
					sm: 'calc(100vw - 24px)',
					md: 'calc(100vw - 40px)',
					lg: 'calc(100vw - 6%)',
					xl: 'calc(100vw - 350px)',
					'2xl': 'calc(100vw - 365px)'
				}}>
				<Flex
					w='100%'
					flexDirection={{
						md: 'row'
					}}
					alignItems={{ xl: 'center' }}
					mb={gap}>
					<Box mb={{ md: '0px' }} minW='0'>
						<Link
							color={mainText}
							href='#'
							bg='inherit'
							borderRadius='inherit'
							fontWeight='bold'
							fontSize={{ sm: '26px', md: '30px', xl: '34px' }}
							lineHeight={{ md: '1.2' }}
							wordBreak='break-word'
							_hover={{ color: { mainText } }}
							_active={{
								bg: 'inherit',
								transform: 'none',
								borderColor: 'transparent'
							}}
							_focus={{
								boxShadow: 'none'
							}}>
							{brandText}
						</Link>
					</Box>
					<Box ms='auto' w={{ md: 'unset' }}>
						<AdminNavbarLinks
							onOpen={props.onOpen}
							logoText={props.logoText}
							secondary={props.secondary}
							fixed={props.fixed}
							scrolled={scrolled}
						/>
					</Box>
				</Flex>
				{secondary ? <Text color='white'>{message}</Text> : null}
			</Box>
		</>
	);
}

AdminNavbar.propTypes = {
	brandText: PropTypes.string,
	variant: PropTypes.string,
	secondary: PropTypes.bool,
	fixed: PropTypes.bool,
	onOpen: PropTypes.func
};
