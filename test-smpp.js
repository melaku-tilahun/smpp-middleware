require('dotenv').config();
const smpp = require('smpp');

const session = smpp.connect({
    host: process.env.SMPP_HOST,
    port: Number(process.env.SMPP_PORT)
});

session.on('connect', () => {
    console.log('Connected to SMPP server');

    session.bind_transceiver(
        {
            system_id: process.env.SMPP_SYSTEM_ID,
            password: process.env.SMPP_PASSWORD
        },
        (pdu) => {
            if (pdu.command_status === 0) {
                console.log('✅ Bind successful');
                console.log('System ID:', pdu.system_id || 'N/A');

                // Keep connection alive
                setInterval(() => {
                    session.enquire_link();
                    console.log('Sent enquire_link');
                }, 30000);

                // Uncomment to send SMS
               
                session.submit_sm(
                    {
                        source_addr: process.env.SMPP_SOURCE_ADDR,
                        destination_addr: process.env.SMPP_DESTINATION_ADDR,
                        short_message: process.env.SMPP_SHORT_MESSAGE
                    },
                    (pdu) => {
                        if (pdu.command_status === 0) {
                            console.log('✅ Message sent');
                            console.log('Message ID:', pdu.message_id);
                        } else {
                            console.error(
                                '❌ Message send failed:',
                                pdu.command_status
                            );
                        }
                    }
                );
               
            } else {
                console.error(
                    '❌ Bind failed. Command Status:',
                    pdu.command_status
                );
                session.close();
            }
        }
    );
});

session.on('error', (err) => {
    console.error('❌ SMPP Error:', err.message);
});

session.on('close', () => {
    console.log('Connection closed');
});

session.on('pdu', (pdu) => {
    console.log('Received PDU:', pdu.command);

    if (pdu.command === 'deliver_sm') {
        session.deliver_sm_resp({
            sequence_number: pdu.sequence_number
        });
        console.log('Sent deliver_sm_resp');
    } else if (pdu.command === 'data_sm') {
        session.data_sm_resp({
            sequence_number: pdu.sequence_number,
            command_status: 0
        });
        console.log('Sent data_sm_resp');
    } else if (pdu.command === 'enquire_link') {
        session.enquire_link_resp({
            sequence_number: pdu.sequence_number
        });
        console.log('Sent enquire_link_resp');
    }
});