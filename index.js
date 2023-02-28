import * as SwaggerValidator from 'swagger-object-validator';
import * as fs from 'fs';

let swaggers = {
    'products-services': {
        url: 'https://openbanking-brasil.github.io/openapi/swagger-apis/products-services/1.0.2.yml',
        schemas: {
            'personal-accounts': '#/components/schemas/ResponsePersonalAccounts',
            'business-accounts': '#/components/schemas/ResponsePersonalAccounts',
            'personal-loans': '#/components/schemas/ResponsePersonalLoans',
            'business-loans': '#/components/schemas/ResponseBusinessLoans',
            'personal-financings': '#/components/schemas/ResponsePersonalFinancings',
            'business-financings': '#/components/schemas/ResponseBusinessFinancings',
            'personal-invoice-financings': '#/components/schemas/ResponsePersonalInvoiceFinancings',
            'business-invoice-financings': '#/components/schemas/ResponseBusinessInvoiceFinancings',
            'personal-credit-cards': '#/components/schemas/ResponsePersonalCreditCards',
            'business-credit-cards': '#/components/schemas/ResponseBusinessCreditCards',
            'personal-unarranged-account-overdraft': '#/components/schemas/ResponsePersonalUnarrangedAccountOverdraft',
            'business-unarranged-account-overdraft': '#/components/schemas/ResponseBusinessUnarrangedAccountOverdraft',
        }
    },
    'channels': {
        url: 'https://openbanking-brasil.github.io/openapi/swagger-apis/channels/1.0.2.yml',
        schemas: {
            'branches': '#/components/schemas/ResponseBranches',
            'electronic-channels': '#/components/schemas/ResponseElectronicChannels',
            'phone-channels': '#/components/schemas/ResponsePhoneChannels',
            'banking-agents': '#/components/schemas/ResponseBankingAgents',
            'shared-automated-teller-machines': '#/components/schemas/ResponseSharedAutomatedTellerMachines',


        }
    },
}

Object.keys(swaggers).forEach(key => swaggers[key]['validator'] = new SwaggerValidator.Handler(swaggers[key]['url']))

const participants = await fetch('https://data.directory.openbankingbrasil.org.br/participants').then(r => r.json())


//Ignore self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";



const validate = (url, participant, resolve, reject) => {
    try {
        const ApiFamily = url.split('/').at(-3)
        const ApiName = url.split('/').at(-1)
        const Schema = swaggers[ApiFamily]['schemas'][ApiName]

        fetch(url)
            .then(r => r.json())
            .then(body => {
                console.log('request:', url)
                swaggers[ApiFamily]['validator'].validateModel(body, Schema, (err, result) => {
                    const resultSet = {
                        orgId: participant?.OrganisationId,
                        orgName: participant?.OrganisationName,
                        url: url,
                        family: ApiFamily,
                        api: ApiName,
                        failStep: '',
                        total: result?.errors?.length,
                        humanReadable: result?.humanReadable(),
                    }
                    console.log('resultSet:', resultSet)
                    resolve(resultSet)
                })
            })
            .catch(e => {
                const resultFailSet = {
                    orgId: participant?.OrganisationId,
                    orgName: participant?.OrganisationName,
                    url: url,
                    family: ApiFamily,
                    api: ApiName,
                    failStep: 1,
                    total: '',
                    humanReadable: '',
                    error: e,
                }
                console.log('fetch resultFailSet:', resultFailSet)
                resolve(resultFailSet)

            })
    } catch (e) {
        const resultFailSet = {
            orgId: participant?.OrganisationId,
            orgName: participant?.OrganisationName,
            url: url,
            family: ApiFamily,
            api: ApiName,
            failStep: 2,
            total: '',
            humanReadable: '',
            error: e,
        }

        console.log('resultFailSet:', resultFailSet)
        resolve(resultFailSet)
    }
}


const participantsPhase1 =
    participants
        .map(p => ({
            OrganisationId: p.OrganisationId,
            OrganisationName: p.OrganisationName,
            AuthorisationServers: (
                p.AuthorisationServers
                    .map(as =>
                        as.ApiResources
                            .filter(apiRes => ['products-services', 'channels'].includes(apiRes.ApiFamilyType))
                            .map(as => ({
                                ApiFamilyType: as.ApiFamilyType,
                                ApiDiscoveryEndpoints: as.ApiDiscoveryEndpoints.map(ep => ({
                                    url: ep.ApiEndpoint
                                }))
                            }))
                    )
                    .filter(as => as.length))
        }))
        .filter(p => p.AuthorisationServers.length)


let runner = [];

participantsPhase1.forEach((participant) => {
    participant.AuthorisationServers.forEach((authorisationServers) => {
        authorisationServers.forEach((authorisationServer) => {
            authorisationServer.ApiDiscoveryEndpoints.forEach((apiDiscoveryEndpoint) => {
                runner.push(new Promise(async (resolve, reject) => {
                    validate(apiDiscoveryEndpoint.url, participant, resolve, reject)
                }))
            })
        })
    })
})



Promise.all(runner).then((values) => {
    console.log('Promise.all:', values)
    const toWrite = values.filter(e => !!!e.ignoring)
    fs.writeFileSync('result-set.json', JSON.stringify(toWrite));
    console.log('done')
}).catch((e) => {
    console.error('fail', e)
});



